import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),protocol=require('../src/workshop-submission.cjs'),community=require('../src/workshop-community.cjs');
const gh=(endpoint,method='GET',body)=>JSON.parse(execFileSync('gh',['api','--hostname','github.com',endpoint,'--method',method,...(body===undefined?[]:['--input','-'])],{input:body===undefined?undefined:JSON.stringify(body),encoding:'utf8',maxBuffer:2*1024*1024,timeout:40000,stdio:['pipe','pipe','pipe']}));

try{
 if(process.env.GITHUB_REPOSITORY!==protocol.COMMUNITY)throw Error('此审核工作流只用于已配置的社区仓库');
 const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
 const number=process.env.GITHUB_EVENT_NAME==='workflow_dispatch'?Number(event.inputs?.issue_number):event.issue?.number;
 if(!Number.isSafeInteger(number)||number<1)throw Error('投稿编号无效');
 const actor=protocol.login(process.env.GITHUB_ACTOR),base=`repos/${protocol.COMMUNITY}`,issue=gh(`${base}/issues/${number}`);
 if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'&&(event.action!=='labeled'||event.label?.name!=='workshop-approved'||event.issue?.body!==issue.body))throw Error('投稿在批准后已变化，需要维护者重新审核');
 const permission=gh(`${base}/collaborators/${actor}/permission`).permission;
 const entry=await protocol.review(issue,permission,community.getBytes);
 // An author edit or withdrawal during download invalidates the approval snapshot.
 const fresh=gh(`${base}/issues/${number}`);
 if(fresh.body!==issue.body||fresh.state!=='open'||!fresh.labels.some(x=>x.name==='workshop-approved'))throw Error('审核期间投稿已变化，请重新审核');
 let committed=false;
 for(let attempt=0;attempt<3;attempt++){
  const endpoint=`${base}/contents/community/catalog.json`,record=gh(endpoint+'?ref=main');
  const catalog=community.catalog(JSON.parse(Buffer.from(record.content,'base64').toString('utf8')));
  if(!protocol.addEntry(catalog,entry)){committed=true;break;}
  community.catalog(catalog);
  try{gh(endpoint,'PUT',{message:`Add reviewed wallpaper from issue #${number}`,branch:'main',sha:record.sha,content:Buffer.from(JSON.stringify(catalog,null,2)+'\n').toString('base64')});committed=true;break;}catch(e){if(!/409/.test(e.stderr?.toString()||e.message)||attempt===2)throw e;}
 }
 if(!committed)throw Error('目录已变化，请重新运行审核');
 gh(`${base}/issues/${number}/comments`,'POST',{body:`作品包、封面、SHA256及投稿归属校验通过，维护者已批准。作品已加入社区目录，播放器刷新后可下载。\n\n[查看目录](https://github.com/${protocol.COMMUNITY}/blob/main/community/catalog.json)`});
 gh(`${base}/issues/${number}`,'PATCH',{state:'closed',state_reason:'completed'});
 console.log(JSON.stringify({ok:true,issue:number,id:entry.id}));
}catch(e){console.error('审核未完成：'+e.message);process.exitCode=1;}
