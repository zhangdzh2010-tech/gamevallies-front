// A work receives only its own data, never the host application's storage.
export const WORK_STORAGE_LIMIT = 256 * 1024;
export function workStorageKey(userId, workId) {
  return `work-data:v1:${encodeURIComponent(userId || 'visitor')}:${encodeURIComponent(workId)}`;
}
export function readWorkStorage(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > WORK_STORAGE_LIMIT) return {};
    const data = JSON.parse(raw);
    return validWorkStorage(data) ? data : {};
  } catch { return {}; }
}
export function validWorkStorage(data) {
  return data && typeof data === 'object' && !Array.isArray(data)
    && Object.keys(data).length <= 200
    && Object.entries(data).every(([key, value]) => key.length <= 1024 && typeof value === 'string')
    && JSON.stringify(data).length <= WORK_STORAGE_LIMIT;
}
export function saveWorkMessage(event, source, channel, storage, key) {
  if (!source || event.source !== source || event.data?.type !== 'work-storage'
    || event.data.channel !== channel || !validWorkStorage(event.data.values)) return false;
  try { storage.setItem(key, JSON.stringify(event.data.values)); return true; }
  catch { return false; }
}
export function withWorkStorage(html, values, channel) {
  const safe = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const script = `<script>(function(){
    var channel=${safe(channel)}, initial=${safe(values)};
    function makeStorage(seed,persist){
      var data=Object.assign(Object.create(null),seed);
      function notify(){if(persist)parent.postMessage({type:'work-storage',channel:channel,values:data},'*');}
      return {
        get length(){return Object.keys(data).length;},
        key:function(i){return Object.keys(data)[i]||null;},
        getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null;},
        setItem:function(k,v){k=String(k);v=String(v);var next=Object.assign(Object.create(null),data);next[k]=v;
          if(k.length>1024||Object.keys(next).length>200||JSON.stringify(next).length>${WORK_STORAGE_LIMIT})throw new DOMException('Work storage quota exceeded','QuotaExceededError');
          data=next;notify();},
        removeItem:function(k){delete data[String(k)];notify();},
        clear:function(){data=Object.create(null);notify();}
      };
    }
    Object.defineProperty(window,'localStorage',{value:makeStorage(initial,true),configurable:false});
    Object.defineProperty(window,'sessionStorage',{value:makeStorage({},false),configurable:false});
  })();<\/script>`;
  // Run before any generated code, including scripts preceding <head>.
  return html.replace(/^(\s*<!doctype[^>]*>)?/i, match => match + script);
}
