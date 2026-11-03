import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const appearance = require('../src/wallpaper-appearance.cjs');

test('legacy settings enable restored reading surfaces without changing playback fields', () => {
  const current = {quality:'performance',paused:true,file:'source.mp4'};
  const values = appearance.update(current, {readableSurfaces:false,surfaceOpacity:25});
  assert.equal(values.readableSurfaces,false);
  assert.equal(values.surfaceOpacity,25);
  assert.equal(appearance.normalize(current).readableSurfaces,true);
  assert.deepEqual(current,{quality:'performance',paused:true,file:'source.mp4'});
  assert.equal(Object.hasOwn(values,'quality'),false);
});

test('restored reading palette guarantees contrast and rejects CSS injection', () => {
  for (const textPrimary of ['#ffffff','#000000','#777777','#f08080']) {
    const values=appearance.normalize({customTextEnabled:true,textPrimary,textSecondary:'#777777',textLink:'#777777'});
    const palette=appearance.readingPalette(values);
    for(const key of ['primary','secondary','link'])assert(appearance.colorContrast(palette[key],palette.background)>=4.5);
  }
  assert.equal(appearance.normalize({textPrimary:'red;display:none'}).textPrimary,'#ffffff');
  assert.equal(appearance.normalize({surfaceOpacity:Infinity}).surfaceOpacity,0);
});
