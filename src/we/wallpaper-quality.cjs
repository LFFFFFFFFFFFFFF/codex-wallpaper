'use strict'
const QUALITY=Object.freeze({smooth:Object.freeze({width:1920,height:1080,fps:30}),original:Object.freeze({width:3840,height:2160,fps:30})})
function quality(value,fallback='smooth'){
 if(value===undefined)return fallback
 if(typeof value!=='string'||!Object.hasOwn(QUALITY,value))throw Error('场景画质无效，请选择流畅或原画')
 return value
}
module.exports={QUALITY,quality}
