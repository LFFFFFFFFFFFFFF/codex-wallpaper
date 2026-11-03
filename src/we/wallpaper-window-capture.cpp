// Only captures a verified SkinForge-owned Wallpaper Engine window. No audio,
// files, script execution, global cursor changes, or general desktop capture.
#define NOMINMAX
#include <windows.h>
#include <tlhelp32.h>
#include <d3d11.h>
#include <dxgi.h>
#include <dxgi1_6.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <algorithm>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <string>
#include <vector>
#include <iostream>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <fcntl.h>
#include <io.h>
using namespace winrt;
using namespace winrt::Windows::Graphics::Capture;
using namespace winrt::Windows::Graphics::DirectX;
using namespace winrt::Windows::Graphics::DirectX::Direct3D11;

bool owned(HWND window, const std::wstring& title, const std::wstring& engine) {
    wchar_t actualTitle[512]{};
    if (!IsWindow(window) || !GetWindowTextW(window, actualTitle, 512) || title != actualTitle) return false;
    DWORD pid{}; GetWindowThreadProcessId(window, &pid);
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) return false;
    wchar_t filename[32768]{}; DWORD length = 32768;
    bool result = QueryFullProcessImageNameW(process, 0, filename, &length) && _wcsicmp(filename, engine.c_str()) == 0;
    CloseHandle(process); return result;
}
DWORD parentProcess() {
    HANDLE snapshot=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);
    if(snapshot==INVALID_HANDLE_VALUE)return 0;
    PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);DWORD parent=0;
    if(Process32FirstW(snapshot,&entry))do{if(entry.th32ProcessID==GetCurrentProcessId()){parent=entry.th32ParentProcessID;break;}}while(Process32NextW(snapshot,&entry));
    CloseHandle(snapshot);return parent;
}
// Engine CLI / PowerShell work can take seconds. Keep only this verified scene
// under its actual parent process's host even while those commands are queued.
// Never resize its render target, activate it, or control another engine window.
class HostGuard {
    HANDLE stop=nullptr;std::thread worker;
    HWND sceneWindow;std::wstring sceneTitle,enginePath;
    void closeOwned() noexcept {
        if(owned(sceneWindow,sceneTitle,enginePath)) {
            ShowWindowAsync(sceneWindow,SW_HIDE);
            PostMessageW(sceneWindow,WM_CLOSE,0,0);
        }
    }
public:
    HostGuard(HWND scene,HWND host,const std::wstring& title,const std::wstring& engine)
        :sceneWindow(scene),sceneTitle(title),enginePath(engine) {
        DWORD hostPid=0;GetWindowThreadProcessId(host,&hostPid);
        if(!IsWindow(host)||!hostPid||hostPid!=parentProcess())throw std::runtime_error("Invalid capture host");
        stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);if(!stop)throw std::runtime_error("Host guard unavailable");
        try{worker=std::thread([=]{
            SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
            bool hiddenByGuard=false;
            while(WaitForSingleObject(stop,16)==WAIT_TIMEOUT){
                if(!owned(scene,title,engine))break;
                DWORD currentHostPid=0;GetWindowThreadProcessId(host,&currentHostPid);
                if(!IsWindow(host)||currentHostPid!=hostPid){closeOwned();break;}
                if(IsIconic(scene)){hiddenByGuard=false;continue;}
                RECT box{},native{};POINT origin{};
                if(!GetClientRect(host,&box)||!ClientToScreen(host,&origin)||!GetWindowRect(scene,&native))continue;
                const LONG width=native.right-native.left,height=native.bottom-native.top;
                const bool fits=IsWindowVisible(host)&&!IsIconic(host)&&width>0&&height>0&&width<=box.right&&height<=box.bottom;
                if(!fits){if(IsWindowVisible(scene)){ShowWindowAsync(scene,SW_HIDE);hiddenByGuard=true;}continue;}
                if(!IsWindowVisible(scene)&&!hiddenByGuard)continue;
                const LONG x=std::clamp(native.left,origin.x,origin.x+box.right-width),y=std::clamp(native.top,origin.y,origin.y+box.bottom-height);
                // Restore/show can raise the engine HWND without changing its
                // rectangle. Geometry alone cannot prove that the host covers it.
                bool aboveHost=false;
                for(HWND above=GetWindow(host,GW_HWNDPREV);above;above=GetWindow(above,GW_HWNDPREV)){
                    if(above==scene){aboveHost=true;break;}
                }
                if(x!=native.left||y!=native.top||hiddenByGuard||aboveHost){
                    SetWindowPos(scene,HWND_BOTTOM,x,y,0,0,SWP_NOSIZE|SWP_NOACTIVATE|SWP_ASYNCWINDOWPOS|(hiddenByGuard?SWP_SHOWWINDOW:0));
                    hiddenByGuard=false;
                }
            }
        });}catch(...){CloseHandle(stop);stop=nullptr;throw;}
    }
    ~HostGuard(){SetEvent(stop);if(worker.joinable())worker.join();CloseHandle(stop);closeOwned();}
};
void writeBytes(const void* data, size_t length) {
    std::cout.write(static_cast<const char*>(data), length);
    if (!std::cout) throw std::runtime_error("Frame pipe closed");
}
struct CaptureCleanup {
    Direct3D11CaptureFramePool pool; GraphicsCaptureSession& session; GraphicsCaptureItem item;
    event_token frameToken,closedToken;
    ~CaptureCleanup() { try { pool.FrameArrived(frameToken);item.Closed(closedToken);if(session)session.Close();pool.Close(); } catch (...) {} }
};
struct ReadbackUnmap {
    ID3D11DeviceContext* context;ID3D11Texture2D* texture;
    ~ReadbackUnmap(){context->Unmap(texture,0);}
};
using FrameClock = std::chrono::steady_clock;
double milliseconds(FrameClock::time_point start, FrameClock::time_point end) {
    return std::chrono::duration<double,std::milli>(end-start).count();
}
int wmain(int argc, wchar_t** argv) {
    try {
        if (argc != 5) return 2;
        std::wstring handleText(argv[1]), title(argv[2]), engine(argv[3]);
        const std::wstring prefix = L"Codex WE Scene ";
        if (handleText.empty() || handleText.find_first_not_of(L"0123456789") != std::wstring::npos || title.size() != prefix.size()+32 || title.substr(0,prefix.size()) != prefix || title.substr(prefix.size()).find_first_not_of(L"0123456789abcdef") != std::wstring::npos) return 2;
        HWND window = reinterpret_cast<HWND>(std::stoull(handleText));
        if (!owned(window,title,engine)) return 3;
        const std::wstring hostText(argv[4]);
        if(hostText.empty()||hostText.find_first_not_of(L"0123456789")!=std::wstring::npos)return 2;
        HWND host=reinterpret_cast<HWND>(std::stoull(hostText));
        SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32);
        SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        HostGuard hostGuard(window,host,title,engine);
        _setmode(_fileno(stdout), _O_BINARY); _setmode(_fileno(stdin), _O_BINARY);
        std::ios::sync_with_stdio(false);std::cin.tie(nullptr);
        init_apartment(apartment_type::multi_threaded);
        if (!GraphicsCaptureSession::IsSupported()) throw std::runtime_error("Windows window capture is unavailable");
        auto factory = get_activation_factory<GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
        GraphicsCaptureItem item{nullptr};
        check_hresult(factory->CreateForWindow(window, guid_of<GraphicsCaptureItem>(), put_abi(item)));
        auto size = item.Size();
        if (size.Width < 1 || size.Height < 1 || size.Width > 3840 || size.Height > 2160) throw std::runtime_error("Scene window dimensions are invalid");
        com_ptr<ID3D11Device> device; com_ptr<ID3D11DeviceContext> context;
        // A headless compute/display adapter may not be DXGI's default device.
        // Prefer a working high-performance hardware adapter, then fall back
        // to the default so systems without that adapter retain capture.
        com_ptr<IDXGIFactory6> adapterFactory;
        if(SUCCEEDED(CreateDXGIFactory1(__uuidof(IDXGIFactory6),adapterFactory.put_void())))for(UINT rank=0;rank<8&&!device;rank++){
            com_ptr<IDXGIAdapter1> adapter;
            if(FAILED(adapterFactory->EnumAdapterByGpuPreference(rank,DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE,__uuidof(IDXGIAdapter1),adapter.put_void())))break;
            DXGI_ADAPTER_DESC1 description{};if(FAILED(adapter->GetDesc1(&description))||description.Flags&DXGI_ADAPTER_FLAG_SOFTWARE)continue;
            device=nullptr;context=nullptr;
            if(FAILED(D3D11CreateDevice(adapter.get(),D3D_DRIVER_TYPE_UNKNOWN,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,nullptr,0,D3D11_SDK_VERSION,device.put(),nullptr,context.put()))){device=nullptr;context=nullptr;}
        }
        if(!device)check_hresult(D3D11CreateDevice(nullptr,D3D_DRIVER_TYPE_HARDWARE,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,nullptr,0,D3D11_SDK_VERSION,device.put(),nullptr,context.put()));
        auto dxgi = device.as<IDXGIDevice>(); com_ptr<IInspectable> projected;
        check_hresult(CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(),projected.put()));
        auto pool = Direct3D11CaptureFramePool::CreateFreeThreaded(projected.as<IDirect3DDevice>(),DirectXPixelFormat::B8G8R8A8UIntNormalized,2,size);
        auto session = pool.CreateCaptureSession(item);
        const auto configureSession=[&]{session.IsCursorCaptureEnabled(false);if(session.IsCursorCaptureEnabled())throw std::runtime_error("Cursor suppression is unavailable");try{session.IsBorderRequired(false);}catch(...){};};
        configureSession();
        std::mutex mutex; std::condition_variable available;
        Direct3D11CaptureFrame latest{nullptr}; bool ended=false;
        auto closedToken=item.Closed([&](auto const&,auto const&) { std::lock_guard<std::mutex> lock(mutex); ended=true; available.notify_all(); });
        auto frameToken=pool.FrameArrived([&](auto const& sender,auto const&) {
            try { auto frame=sender.TryGetNextFrame(); if (frame) { std::lock_guard<std::mutex> lock(mutex); latest=frame; available.notify_all(); } }
            catch (...) { std::lock_guard<std::mutex> lock(mutex); ended=true; available.notify_all(); }
        });
        CaptureCleanup cleanup{pool,session,item,frameToken,closedToken};
        session.StartCapture();
        com_ptr<IDXGIAdapter> captureAdapter;check_hresult(dxgi->GetAdapter(captureAdapter.put()));DXGI_ADAPTER_DESC adapterDescription{};check_hresult(captureAdapter->GetDesc(&adapterDescription));
        std::cerr << "{\"backend\":\"windows-graphics-capture\",\"cursorCaptureEnabled\":false,\"audio\":false,\"hostGuard\":true,\"streamPause\":true,\"mousePipe\":true,\"directMappedRead\":true,\"vendorId\":" << adapterDescription.VendorId << ",\"deviceId\":" << adapterDescription.DeviceId << "}" << std::endl;
        com_ptr<ID3D11Texture2D> staging; D3D11_TEXTURE2D_DESC previous{};
        std::vector<uint8_t> paddedPixels;
        int command;
        while ((command=std::cin.get()) != EOF) {
            if (!owned(window,title,engine)) break;
            // Keep the host guard and a reusable capture pool. Some drivers
            // cannot recreate a capture session on a closed session's pool.
            // Raw readback stops completely; reduce the auxiliary WGC updates
            // while Chromium owns the displayed video stream.
            if(command=='m'){
                unsigned char b[4];if(!std::cin.read(reinterpret_cast<char*>(b),4))break;
                RECT rect{};if(GetClientRect(window,&rect)&&!IsIconic(window)){
                    int x=int((b[0]|(unsigned(b[1])<<8))*double(std::max(0L,rect.right-1))/65535.0);
                    int y=int((b[2]|(unsigned(b[3])<<8))*double(std::max(0L,rect.bottom-1))/65535.0);
                    PostMessageW(window,WM_MOUSEMOVE,0,MAKELPARAM(x,y));
                }continue;
            }
            if(command=='s'){
                bool throttled=false;try{session.MinUpdateInterval(std::chrono::seconds(1));throttled=true;}catch(...){}
                std::cerr<<"{\"type\":\"captureState\",\"suspended\":true,\"throttled\":"<<(throttled?"true":"false")<<"}"<<std::endl;continue;
            }
            if(command=='r'){
                try{session.MinUpdateInterval(std::chrono::milliseconds(16));}catch(...){}
                {std::lock_guard<std::mutex> lock(mutex);if(latest)latest.Close();latest=nullptr;}
                std::cerr<<"{\"type\":\"captureState\",\"suspended\":false,\"throttled\":false}"<<std::endl;continue;
            }
            if(command!='f')break;
            if(!session)continue;
            const auto waitStart=FrameClock::now();
            Direct3D11CaptureFrame frame{nullptr}; com_ptr<ID3D11Texture2D> texture;
            D3D11_TEXTURE2D_DESC desc{}; UINT width=0,height=0;
            // ContentSize changes before the pool texture does. Recreate after
            // releasing old frames, then wait for a full-size replacement.
            for (;;) {
                { std::unique_lock<std::mutex> lock(mutex); available.wait_for(lock,std::chrono::seconds(10),[&]{return ended || bool(latest);}); if (ended || !owned(window,title,engine)) return 0; if (!latest) continue; frame=latest;latest=nullptr; }
                auto content=frame.ContentSize();
                if (content.Width<1 || content.Height<1 || content.Width>3840 || content.Height>2160) throw std::runtime_error("Invalid scene frame size");
                if (content.Width!=size.Width || content.Height!=size.Height) {
                    size=content; frame.Close();frame=nullptr;
                    { std::lock_guard<std::mutex> lock(mutex);latest=nullptr; }
                    pool.Recreate(projected.as<IDirect3DDevice>(),DirectXPixelFormat::B8G8R8A8UIntNormalized,2,size);
                    continue;
                }
                auto access=frame.Surface().as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();texture=nullptr;
                check_hresult(access->GetInterface(__uuidof(ID3D11Texture2D),texture.put_void()));texture->GetDesc(&desc);
                if (desc.Width>3840 || desc.Height>2160 || desc.Format!=DXGI_FORMAT_B8G8R8A8_UNORM) throw std::runtime_error("Invalid scene frame");
                if (desc.Width<static_cast<UINT>(content.Width) || desc.Height<static_cast<UINT>(content.Height)) {frame.Close();frame=nullptr;continue;}
                width=content.Width;height=content.Height;break;
            }
            const auto readbackStart=FrameClock::now();
            if (!staging || desc.Width!=previous.Width || desc.Height!=previous.Height) {
                previous=desc;desc.Usage=D3D11_USAGE_STAGING;desc.BindFlags=0;desc.CPUAccessFlags=D3D11_CPU_ACCESS_READ;desc.MiscFlags=0;staging=nullptr;
                check_hresult(device->CreateTexture2D(&desc,nullptr,staging.put()));
            }
            context->CopyResource(staging.get(),texture.get());
            D3D11_MAPPED_SUBRESOURCE mapped{};check_hresult(context->Map(staging.get(),0,D3D11_MAP_READ,0,&mapped));
            ReadbackUnmap unmap{context.get(),staging.get()};
            const auto copyStart=FrameClock::now();
            const size_t rowBytes=static_cast<size_t>(width)*4,pixelBytes=rowBytes*height;
            if(mapped.RowPitch<rowBytes)throw std::runtime_error("Invalid mapped scene row pitch");
            const void* pixels=mapped.pData;
            // Most display widths have a tight D3D row pitch. Write the mapped
            // staging data directly: no per-frame allocation, zero-fill or
            // second full-frame CPU copy. Padded rows reuse one bounded buffer.
            if(mapped.RowPitch!=rowBytes){
                paddedPixels.resize(pixelBytes);
                for(UINT y=0;y<height;y++)memcpy(paddedPixels.data()+y*rowBytes,static_cast<uint8_t*>(mapped.pData)+y*mapped.RowPitch,rowBytes);
                pixels=paddedPixels.data();
            }
            frame.Close();frame=nullptr;texture=nullptr;
            uint32_t header[3]={0x31474653,width,height};
            const auto writeStart=FrameClock::now();
            writeBytes(header,sizeof(header));writeBytes(pixels,pixelBytes);std::cout.flush();
            const auto writeEnd=FrameClock::now();
            std::cerr << "{\"type\":\"frameTiming\",\"nativeWait\":" << milliseconds(waitStart,readbackStart)
                << ",\"readback\":" << milliseconds(readbackStart,copyStart)
                << ",\"rowCopy\":" << milliseconds(copyStart,writeStart)
                << ",\"pipeWrite\":" << milliseconds(writeStart,writeEnd) << "}" << std::endl;
        }
        return 0;
    } catch (winrt::hresult_error const& error) { std::cerr << "Native scene capture unavailable: " << static_cast<uint32_t>(error.code()) << std::endl; return 1; }
      catch (std::exception const& error) { std::cerr << error.what() << std::endl; return 1; }
}
