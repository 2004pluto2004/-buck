(function(){
  'use strict';
  const M=window.BuckModel,C=window.BuckCalc;
  let project=M.defaultProject(),dirty=false;
  const $=id=>document.getElementById(id);
  const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
  const groups=[
    ['base','01 · 功率级工作点','只改这里会沿用其他预设。器件选择的完整过程见顶部文字流程。',true],
    ['timing','02 · 运行模式与补电时间','Dmax、最长不补电时间必须独立确定。100% 高侧持续导通不能靠无限加大 Cboot 解决。',true],
    ['devices','03 · 器件与耐压边界','示例器件可替换；所有额定、Qg、栅漏及其条件都需从当前厂家资料核对。',false],
    ['driver','04 · 驱动电平与电流','可选已扣压降的输出电平，或由供电减去一次输出压降。未使用的一组输入仍显示在报告中，但不参与计算。',false],
    ['zener','05 · 双 Zener 钳位','VGS 目标不是 VGS(th)。这里仅做规格点算术，不预测瞬态钳位。',false],
    ['resistors','06 · 电阻与耦合电容','电阻值均可分路调整；示例为 20 / 10 / 100 / 10k Ω，C1/C2 均 100 nF。',false],
    ['boot','07 · 自举电容与充电路径','有效容量必须有工况来源；R9 与实际路径总电阻分别记录，不重复相加。',false],
    ['charge','08 · 电荷与漏电预算','完整模式需要整个最长不补电区间的 Qnetwork；已包括栅极、耦合电容、Zener 和下拉的电荷。',false],
    ['power','09 · 完整周期 RMS 与功耗','录入可验证的自身支路电压 RMS。本版本不导入波形 CSV，不伪造仿真。',false]
  ];
  for(const [key,title,note,open] of groups){
    const section=node('details',undefined,'input-section');section.open=open;
    section.append(node('summary',title));const inner=node('div',undefined,'section-inner');inner.append(node('p',note,'section-note'));
    const grid=node('div',undefined,'field-grid');
    for(const f of M.fields.filter(x=>x.group===key)){
      const wrap=node('div',undefined,'field'+(f.type==='text'?' text-field':''));const label=node('label',f.label);label.htmlFor=f.key;
      let input;
      if(f.type.startsWith('select')){input=node('select');for(const [v,t] of f.options){const o=node('option',t);o.value=v;input.append(o);}}
      else if(f.type==='text'){input=node('textarea');input.maxLength=f.maxLength;input.rows=2;}
      else{input=node('input');input.type='number';input.step='any';input.inputMode='decimal';input.min=f.min;input.max=f.max;input.placeholder=f.optional?'待确定':'请输入';}
      input.id=f.key;input.setAttribute('aria-describedby',f.key+'-help');
      input.addEventListener('input',()=>{project.params[f.key]=f.type==='number'?(input.validity.badInput?NaN:input.value===''?null:Number(input.value)):f.type==='select-number'?Number(input.value):input.value;dirty=true;render();});
      const help=node('p',f.help||'','help');help.id=f.key+'-help';wrap.append(label,input,help);grid.append(wrap);
    }
    inner.append(grid);section.append(inner);$('inputs').append(section);
  }
  function populate(){for(const f of M.fields)$(f.key).value=project.params[f.key]??'';$('project-name').value=project.name;render();}
  function kv(target,rows){const list=node('dl',undefined,'key-values');for(const [k,v]of rows){const row=node('div');row.append(node('dt',k),node('dd',v));list.append(row);}target.append(list);}
  function metric(label,value,unit){const e=node('div',undefined,'metric');e.append(node('span',label));const strong=node('strong',C.fmt(value));strong.append(node('small',unit));e.append(strong);return e;}
  function render(){
    const r=C.calculate(project),p=project.params;
    $('overall').textContent=r.overall;$('counts').textContent=r.errors.length+' 项输入/约束问题 · '+r.missing.length+' 项缺失 · 硬件未验证';
    for(const id of ['metrics','boot-result','bias-result','power-result','issues','bom','notices'])$(id).replaceChildren();
    for(const f of M.fields){const v=p[f.key];$(f.key).setAttribute('aria-invalid',String(f.type==='number'&&v!==null&&(!Number.isFinite(v)||v<f.min||v>f.max||(f.exclusiveMin&&v===f.min))));}
    $('metrics').append(metric('标称占空比',r.timing?r.timing.duty*100:null,'%'),metric('开通时间',r.timing?.ton_us,'μs'),metric('周期',r.timing?.period_us,'μs'));
    if(r.boot){
      $('boot-result').append(node('span',r.boot.status,'badge'));
      kv($('boot-result'),[['Qtotal',C.fmt(r.boot.qTotal_nC)+' nC'],['所需最小有效容量',C.fmt(r.boot.minEffective_nF)+' nF'],['所填电容有效容量',C.fmt(r.boot.effective_nF)+' nF'],['预测自举压降',C.fmt(r.boot.predictedDroop_V)+' V'],['HB 目标压降余量',C.fmt(r.boot.targetHeadroom_V)+' V'],['HB 预计谷值',C.fmt(r.boot.predictedValley_V)+' V'],['名义补电窗口',C.fmt(r.timing?.nominalWindow_us)+' μs'],['Dmax 下有效补电窗口',C.fmt(r.timing?.minWindow_us)+' μs'],['理想无负载 RC 恢复比例',r.boot.idealRecovery===null?'未知':C.fmt(r.boot.idealRecovery*100)+'%（非补电保证）']]);
    }else $('boot-result').append(node('p','请先修正基础参数；空白不会被视作零。','muted'));
    for(const b of r.bias){$('bias-result').append(node('h3',b.side));kv($('bias-result'),[['所需稳态电流',C.fmt(b.needed_mA)+' mA'],['总串联电阻上限',C.fmt(b.rTotalMax_Ohm)+' Ω'],['偏置电阻上限（已扣主路）',C.fmt(b.rBiasMax_Ohm)+' Ω'],['所选稳态支路电流',C.fmt(b.steadyCurrent_mA)+' mA'],['关断外阻近似',C.fmt(b.offApprox_Ohm)+' Ω'],['简化耦合 RC 时间常数',C.fmt(b.tau_us)+' μs']]);}
    if(r.available)kv($('bias-result'),[['实际计算的高 / 低侧可用电平',C.fmt(r.available.high_V)+' / '+C.fmt(r.available.low_V)+' V']]);
    if(r.clamp)kv($('bias-result'),[['Zener 正向参考算术和',C.fmt(r.clamp.positive_V)+' V'],['负向参考算术和（高 / 低）',C.fmt(r.clamp.negativeHigh_V)+' / '+C.fmt(r.clamp.negativeLow_V)+' V']]);
    const powerTable=node('table');const tr=node('tr');for(const t of ['位号','平均功耗','比较限值'])tr.append(node('th',t));const head=node('thead');head.append(tr);powerTable.append(head);const body=node('tbody');for(const x of r.power){const row=node('tr');row.title=x.status;row.append(node('td',x.part),node('td',x.power_W===null?'待 RMS':C.fmt(x.power_W*1000)+' mW'),node('td',C.fmt(x.limit_W*1000)+' mW'));if(x.power_W>x.limit_W)row.className='errors';body.append(row);}powerTable.append(body);$('power-result').append(powerTable);
    for(const [key,title] of [['errors','输入与约束'],['missing','待补数据'],['warnings','风险提示']]){if(!r[key].length)continue;$('issues').append(node('h3',title));const list=node('ul',undefined,'issue-list '+key);for(const x of r[key])list.append(node('li',x.message));$('issues').append(list);}
    for(const row of M.bom(p)){const tr=node('tr');for(const value of row)tr.append(node('td',value));$('bom').append(tr);}
    for(const text of M.activeNotices(p))$('notices').append(node('li',text));
  }
  function message(text,error=false){$('file-message').textContent=text;$('file-message').className=error?'errors':'';}
  function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  $('project-name').addEventListener('input',()=>{project.name=$('project-name').value;dirty=true;});
  $('reset-preset').addEventListener('click',()=>{if(dirty&&!confirm('恢复示例会替换当前未导出的参数，继续吗？'))return;project=M.defaultProject();dirty=false;populate();message('已恢复 2026-10-26 示例；Qnetwork、有效容量等仍保持缺失。');});
  $('new-custom').addEventListener('click',()=>{if(dirty&&!confirm('新建会替换当前未导出的参数，继续吗？'))return;project=M.customProject();dirty=false;populate();message('已新建空白自定义方案。请先用文字流程选型，再填写所选器件参数；不会沿用示例额定。');});
  $('import-project').addEventListener('click',()=>$('file-input').click());
  $('file-input').addEventListener('change',async()=>{const f=$('file-input').files[0];if(!f)return;try{if(f.size>250000)throw new Error('文件超过 250 KB。');const candidate=C.parseProject(await f.text());if(dirty&&!confirm('导入会替换当前未导出的参数，继续吗？'))return;project=candidate;dirty=false;populate();message('JSON 已导入；文本仅作为文本显示，未联网。');}catch(e){message('导入失败：'+e.message,true);}finally{$('file-input').value='';}});
  $('export-project').addEventListener('click',()=>{try{download(C.serializeProject(project),'buck-project.json','application/json;charset=utf-8');dirty=false;message('已导出 JSON。所有预设、缺失项和来源文本均保留。');}catch(e){message('无法导出：'+e.message,true);}});
  $('export-report').addEventListener('click',()=>{try{download(C.report(project),'buck-calculation-report.txt','text/plain;charset=utf-8');message('已导出含公式、假设、器件状态、缺失项与风险的 UTF-8 文本报告。');}catch(e){message('无法导出：'+e.message,true);}});
  for(const text of M.formulae)$('formulae').append(node('li',text));
  for(const [label,url]of M.sources){const li=node('li'),a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';li.append(a);$('sources').append(li);}
  populate();
})();
