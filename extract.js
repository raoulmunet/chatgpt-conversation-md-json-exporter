// Runs only in the open ChatGPT tab, after the user starts an export.
window.__chatExporterExtract = async function () {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const roleSelector = '[data-message-author-role]';
  const turnSelector = 'article[data-turn], article[id^="conversation-turn-"], article[data-testid^="conversation-turn"], [data-testid^="conversation-turn-"], main div[class^="block-"]';
  const warnings = [];
  const findNodes = () => {
    const roles=Array.from(document.querySelectorAll(roleSelector)).filter(n=>!n.parentElement?.closest(roleSelector));
    if (roles.length) return roles;
    const legacy=Array.from(document.querySelectorAll('article[data-turn], article[id^="conversation-turn-"], article[data-testid^="conversation-turn"], [data-testid^="conversation-turn-"]')).filter(n=>!n.parentElement?.closest('article[data-turn], article[id^="conversation-turn-"], article[data-testid^="conversation-turn"], [data-testid^="conversation-turn-"]'));
    if(legacy.length)return legacy;
    // ChatGPT Work renders messages without role/test-id attributes. Each
    // message has a block wrapper containing either a user bubble or Markdown.
    const workRoots='[class*="group/user-message"], [class*="bg-user-message"], [class^="MarkdownRoot-"]';
    const blocks=Array.from(document.querySelectorAll('main div[class^="block-"]')).filter(n=>n.querySelector(workRoots));
    if(blocks.length)return blocks.filter(n=>!Array.from(n.querySelectorAll('div[class^="block-"]')).some(child=>child.querySelector(workRoots)));
    // Some builds omit the block wrapper. Select the visible content roots.
    return Array.from(document.querySelectorAll(`main ${workRoots.split(', ').join(', main ')}`))
      .filter(n=>!n.parentElement?.closest(workRoots));
  };
  const scrollParent = el => {
    for (let node=el?.parentElement; node; node=node.parentElement) {
      const style=getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight>node.clientHeight+40) return node;
    }
    let best=null;
    document.querySelectorAll('main,div').forEach(node=>{
      const style=getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight>node.clientHeight+80 && (!best || node.scrollHeight>best.scrollHeight)) best=node;
    });
    return best || document.scrollingElement || document.documentElement;
  };
  for (let i=0;i<8&&!findNodes().length;i++) await wait(250);
  const diagnostics=()=>({pageTitle:document.title,url:location.href,roleNodes:document.querySelectorAll(roleSelector).length,turnNodes:findNodes().length,workUserRoots:document.querySelectorAll('main [class*="group/user-message"]').length,workAssistantRoots:document.querySelectorAll('main [class^="MarkdownRoot-"]').length,mainPresent:!!document.querySelector('main')});
  const earliest=findNodes()[0];
  if (!earliest) return {messages:[],warnings:['No message elements found.'],diagnostics:diagnostics()};
  const scroller=scrollParent(earliest);
  scroller.scrollTop=0;
  await wait(600);
  for (let i=0;i<8 && scroller.scrollTop>4;i++) {scroller.scrollTop=0;await wait(300);}
  const firstTurn=findNodes()[0]?.closest(turnSelector)?.getAttribute('data-testid') || '';
  const firstNumber=Number(firstTurn.match(/conversation-turn-(\d+)/)?.[1]);
  if (firstTurn && Number.isInteger(firstNumber) && firstNumber>0) warnings.push(`The first visible turn is ${firstNumber}; earlier turns may be missing.`);

  const ignored=new Set(['SCRIPT','STYLE','BUTTON','INPUT','TEXTAREA','SELECT','NOSCRIPT','IFRAME','VIDEO','AUDIO']);
  const allowed=new Set(['P','DIV','SPAN','BR','STRONG','B','EM','I','S','DEL','U','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','PRE','CODE','TABLE','THEAD','TBODY','TFOOT','TR','TH','TD','A','IMG','HR','SUP','SUB','FIGURE','FIGCAPTION','DETAILS','SUMMARY','KBD','SVG','G','PATH','RECT','CIRCLE','ELLIPSE','LINE','POLYLINE','POLYGON','TEXT','TSPAN','DEFS','CLIPPATH','MARKER','USE','TITLE','DESC']);
  const svgAllowed=new Set(['viewBox','xmlns','width','height','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','d','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','points','transform','opacity','font-size','font-family','text-anchor','dominant-baseline','role','aria-label','preserveAspectRatio','marker-end','marker-start','refX','refY','markerWidth','markerHeight','orient','id','clip-path']);
  const safeUrl=(url, image=false) => {
    try {
      if (image && /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(url)) return url;
      const value=new URL(url,location.href);
      return (['https:','http:'].includes(value.protocol) || (image && value.protocol==='blob:')) ? value.href : '';
    } catch {return '';}
  };
  const cleanNode=(node, inSvg=false) => {
    if (node.nodeType===Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
    if (node.nodeType!==Node.ELEMENT_NODE || ignored.has(node.tagName)) return null;
    if (node.tagName==='SVG') {
      const box=(node.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
      const width=parseFloat(node.getAttribute('width'))||box[2]||0;
      const height=parseFloat(node.getAttribute('height'))||box[3]||0;
      const labels=node.querySelector('text,foreignObject')?.textContent?.trim();
      // ChatGPT puts a small SVG control icon beside every code sample. It is
      // not part of the answer and must not become a diagram in the export.
      if (!labels && (width<80 || height<50)) return null;
    }
    if (node.tagName==='DIV' && node.classList.contains('contain-inline-size')) {
      const code=node.querySelector('code[class*="CodeContent-"]');
      if(code) {
        const pre=document.createElement('pre');
        const cleanCode=document.createElement('code');
        cleanCode.textContent=code.textContent;
        pre.append(cleanCode);
        return pre;
      }
    }
    const svg=inSvg || node.tagName.toLowerCase()==='svg';
    const tag=node.tagName.toUpperCase();
    if (!allowed.has(tag)) {
      const fragment=document.createDocumentFragment();
      for (const child of node.childNodes) {const clean=cleanNode(child,svg);if(clean)fragment.append(clean);}
      return fragment;
    }
    const copy=svg ? document.createElementNS('http://www.w3.org/2000/svg', node.localName) : document.createElement(node.localName);
    if (svg) {
      for (const attr of node.attributes) {
        const localReference=/^url\(\s*['"]?#[\w-]+['"]?\s*\)$/i.test(attr.value);
        if (svgAllowed.has(attr.name) && (!/url\s*\(/i.test(attr.value) || localReference)) copy.setAttribute(attr.name,attr.value);
      }
      // Diagram renderers often define all colors in CSS classes. Inline the
      // computed values so the saved SVG remains legible without the site CSS.
      for (const property of ['fill','stroke','stroke-width','font-size','font-family','opacity']) {
        if (copy.hasAttribute(property)) continue;
        const value=getComputedStyle(node).getPropertyValue(property).trim();
        if (value && !/[;{}<>]/.test(value) && !/url\s*\(/i.test(value) && value.length<100) copy.setAttribute(property,value);
      }
    } else {
      for (const name of ['colspan','rowspan','start','open','aria-label','title']) if(node.hasAttribute(name))copy.setAttribute(name,node.getAttribute(name));
      if (node.classList.contains('whitespace-pre-wrap')) copy.setAttribute('class','chat-plaintext');
      if (tag==='A') {const href=safeUrl(node.getAttribute('href')||'');if(href)copy.setAttribute('href',href);}
      if (tag==='IMG') {
        const src=safeUrl(node.currentSrc||node.getAttribute('src')||'',true);
        if(src)copy.setAttribute('src',src);
        copy.setAttribute('alt',node.getAttribute('alt')||'Image');
      }
      if (tag==='CODE') {
        const language=(node.className?.match?.(/language-([\w+-]+)/)||[])[1];
        if(node.className?.includes?.('CodeContent-')) copy.setAttribute('class','chat-code-block');
        else if(language)copy.setAttribute('class',`language-${language}`);
      }
    }
    for (const child of node.childNodes) {const clean=cleanNode(child,svg);if(clean)copy.append(clean);}
    return copy;
  };
  const cleanText=s => (s||'').replace(/\u00a0/g,' ');
  const svgData=node=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(node));
  const inline=node => {
    if(node.nodeType===Node.TEXT_NODE)return cleanText(node.nodeValue).replace(/([\\`*_\[\]])/g,'\\$1');
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const children=()=>Array.from(node.childNodes,inline).join('');
    const tag=node.tagName.toUpperCase();
    if(tag==='BR')return '\n';
    if(['STRONG','B'].includes(tag))return `**${children()}**`;
    if(['EM','I'].includes(tag))return `*${children()}*`;
    if(['DEL','S'].includes(tag))return `~~${children()}~~`;
    if(tag==='CODE')return '`'+(node.textContent||'').replace(/`/g,'\\`')+'`';
    if(tag==='IMG')return `![${(node.getAttribute('alt')||'Image').replace(/\]/g,'\\]')}](${node.getAttribute('src')||''})`;
    if(tag==='A')return `[${children()||node.getAttribute('href')}](${node.getAttribute('href')||''})`;
    if(tag==='SVG')return `![${(node.getAttribute('aria-label')||node.textContent?.trim()||'Diagram').replace(/\]/g,'\\]')}](${svgData(node)})`;
    return children();
  };
  const blocks=(node, depth=0) => {
    if(node.nodeType===Node.TEXT_NODE)return cleanText(node.nodeValue);
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const tag=node.tagName.toUpperCase();
    if(/^H[1-6]$/.test(tag))return `\n${'#'.repeat(Number(tag[1]))} ${inline(node).trim()}\n\n`;
    if(tag==='PRE') {
      const code=node.querySelector('code');const content=cleanText((code||node).textContent).replace(/\n$/,'');
      const language=(code?.className?.match?.(/language-([\w+-]+)/)||[])[1]||'';
      const fence='`'.repeat(Math.max(3,...Array.from(content.matchAll(/`+/g),m=>m[0].length+1)));
      return `\n${fence}${language}\n${content}\n${fence}\n\n`;
    }
    if(tag==='CODE' && node.classList.contains('chat-code-block')) {
      const content=cleanText(node.textContent).replace(/\n$/,'');
      const fence='`'.repeat(Math.max(3,...Array.from(content.matchAll(/`+/g),m=>m[0].length+1)));
      return `\n${fence}\n${content}\n${fence}\n\n`;
    }
    if(tag==='TABLE') {
      const rows=Array.from(node.querySelectorAll('tr')).map(tr=>Array.from(tr.children).filter(c=>['TH','TD'].includes(c.tagName)).map(cell=>inline(cell).replace(/\|/g,'\\|').replace(/\n/g,'<br>').trim()));
      if(!rows.length)return '';
      const width=Math.max(...rows.map(r=>r.length));
      const line=r=>'| '+Array.from({length:width},(_,i)=>r[i]||'').join(' | ')+' |';
      return `\n${line(rows[0])}\n${line(Array(width).fill('---'))}\n${rows.slice(1).map(line).join('\n')}\n\n`;
    }
    if(tag==='UL'||tag==='OL')return '\n'+Array.from(node.children).filter(c=>c.tagName==='LI').map((li,i)=>{
      const prefix=tag==='UL' ? '- ' : `${Number(node.getAttribute('start')||1)+i}. `;
      const lead=Array.from(li.childNodes).filter(c=>!['UL','OL'].includes(c.tagName)).map(c=>c.nodeType===Node.TEXT_NODE?inline(c):(['P','DIV'].includes(c.tagName)?inline(c):inline(c))).join('').trim();
      const nested=Array.from(li.children).filter(c=>['UL','OL'].includes(c.tagName)).map(c=>blocks(c,depth+1).trimEnd().split('\n').map(x=>'  '+x).join('\n')).join('\n');
      return '  '.repeat(depth)+prefix+lead+(nested?'\n'+nested:'');
    }).join('\n')+'\n\n';
    if(tag==='BLOCKQUOTE')return '\n'+blocksChildren(node).trim().split('\n').map(line=>'> '+line).join('\n')+'\n\n';
    if(tag==='P'||tag==='FIGCAPTION')return inline(node).trim()+'\n\n';
    if(tag==='HR')return '\n---\n\n';
    if(tag==='IMG'||tag==='SVG')return '\n'+inline(node)+'\n\n';
    if(tag==='BR')return '\n';
    if(tag==='DIV'||tag==='FIGURE'||tag==='DETAILS'||tag==='SUMMARY')return blocksChildren(node);
    return inline(node);
  };
  const blocksChildren=node=>Array.from(node.childNodes,child=>blocks(child)).join('');
  let externalImages=0, inaccessibleImages=0, emptyMessages=0;
  const collected=new Map();
  let sequence=0;
  const harvest=async () => {
  for (const element of findNodes()) {
    const role=element.getAttribute('data-message-author-role')||element.getAttribute('data-turn')||element.querySelector(roleSelector)?.getAttribute('data-message-author-role')||(element.matches('[class*="group/user-message"], [class*="bg-user-message"]')||element.querySelector('.user-message-bubble-color, [class*="group/user-message"], [class*="bg-user-message"]')?'user':element.matches('[class^="MarkdownRoot-"]')||element.querySelector('[class^="MarkdownRoot-"]')?'assistant':'unknown');
    if (!['user','assistant'].includes(role)) continue;
    const turn=element.matches(turnSelector) ? element : element.closest(turnSelector);
    const identifier=element.getAttribute('data-message-id')||turn?.getAttribute('data-turn-id')||turn?.getAttribute('data-testid')||turn?.id;
    const key=identifier ? `${role}:${identifier}` : `${role}:${element.textContent?.slice(0,160)}:${element.textContent?.length}`;
    if(collected.has(key))continue;
    // A turn's content container may include controls; prefer message bodies.
    const candidates=Array.from(element.querySelectorAll('.markdown, .whitespace-pre-wrap, [data-testid="message-text"], [class^="MarkdownRoot-"], [class*="bg-user-message"], pre, table, img, svg'));
    const roots=candidates.filter(n=>!candidates.some(other=>other!==n&&other.contains(n)) && !n.closest('button'));
    const source=roots.length ? roots : [element];
    const container=document.createElement('div');
    for(const part of source){const clean=cleanNode(part);if(clean)container.append(clean);}
    for(const image of container.querySelectorAll('img')) {
      const src=image.getAttribute('src');
      if(!src) {inaccessibleImages++;continue;}
      if(src.startsWith('data:'))continue;
      try {
        const response=await Promise.race([fetch(src,{credentials:'include'}),new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),3500))]);
        if(!response.ok)throw Error('fetch failed');
        const blob=await response.blob();
        if(!/^image\/(png|jpeg|gif|webp|svg\+xml)$/i.test(blob.type)||blob.size>8_000_000)throw Error('unsupported or large image');
        const embedded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
        image.setAttribute('src',embedded);
      } catch {externalImages++;}
    }
    const canvasList=element.querySelectorAll('canvas');
    for(const canvas of canvasList) {
      try {const img=document.createElement('img');img.src=canvas.toDataURL('image/png');img.alt='Canvas diagram';container.append(img);}
      catch {inaccessibleImages++;}
    }
    const markdown=blocksChildren(container).replace(/\n{3,}/g,'\n\n').trim();
    const text=cleanText(container.textContent).trim();
    if(!markdown && !text && !container.querySelector('img,svg'))emptyMessages++;
    const order=Number((turn?.getAttribute('data-testid')||turn?.id||'').match(/conversation-turn-(\d+)/)?.[1]);
    collected.set(key,{order:Number.isFinite(order)?order:null,sequence:sequence++,message:{role,markdown,text,images:[
      ...Array.from(container.querySelectorAll('img'),img=>({alt:img.alt,src:img.src})),
      ...Array.from(container.querySelectorAll('svg'),svg=>({alt:svg.getAttribute('aria-label')||'Diagram',src:svgData(svg)}))
    ]}});
  }
  };
  await harvest();
  let same=0,previous=-1,steps=0;
  for (;steps<500;steps++) {
    const top=scroller.scrollTop;
    if(top===previous) {if(++same>=3)break;} else same=0;
    previous=top;
    const step=Math.max(250,Math.floor(scroller.clientHeight*.55));
    scroller.scrollTop=top+step;
    await wait(180);
    await harvest();
  }
  if(steps>=500)warnings.push('The scan reached its time limit before the end. Scan again or compare the message count with the original.');
  const records=Array.from(collected.values());
  records.sort((a,b)=>a.order!==null&&b.order!==null ? a.order-b.order : a.sequence-b.sequence);
  const messages=records.map(x=>x.message);
  if(externalImages)warnings.push(`${externalImages} image(s) could not be embedded. Their original links were kept in the Markdown and JSON files.`);
  if(inaccessibleImages)warnings.push(`${inaccessibleImages} image or canvas item(s) could not be captured. Review the source conversation.`);
  if(emptyMessages)warnings.push(`${emptyMessages} message(s) have no readable text or image. They may contain interactive content; compare against the original.`);
  if(document.querySelectorAll('iframe').length)warnings.push('This page includes embedded frames. Content inside those frames may not appear in the export.');
  let title=document.title.replace(/\s*[|–-]\s*ChatGPT\s*$/i,'').trim();
  if(!title||title==='ChatGPT')title=messages.find(m=>m.role==='user')?.text.slice(0,90)||'ChatGPT conversation';
  return {schemaVersion:1,title,url:location.href,exportedAt:new Date().toISOString(),messages,warnings,diagnostics:diagnostics()};
};
