(function (root, factory) {
  const api=factory(typeof module==='object' && module.exports ? require('./model.js') : root.BuckModel);
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.BuckCalc=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(M) {
  'use strict';
  const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
  function validateProject(p) {
    if (!p || typeof p!=='object' || Array.isArray(p)) throw new Error('项目必须是 JSON 对象。');
    if (Object.keys(p).some(k=>!['schemaVersion','name','preset','params'].includes(k))) throw new Error('项目包含未知字段。');
    if(!['epc2366-20261026','custom'].includes(p.preset)) throw new Error('未知预设类型。');
    if (p.schemaVersion!==1) throw new Error('不支持的 schemaVersion；需要 1。');
    if (typeof p.name!=='string'||p.name.length>120) throw new Error('项目名称须为不超过 120 字符的文本。');
    if (!p.params||typeof p.params!=='object'||Array.isArray(p.params)) throw new Error('缺少 params 对象。');
    const keys=new Set(M.fields.map(f=>f.key));
    if (Object.keys(p.params).some(k=>!keys.has(k))) throw new Error('params 包含未知字段。');
    for (const f of M.fields) {
      if (!own(p.params,f.key)) throw new Error('缺少字段：'+f.key);
      const v=p.params[f.key];
      if (f.type==='number') {
        if (v===null) continue; // Incomplete drafts remain representable; calculate flags missing fields.
        if (typeof v!=='number'||!Number.isFinite(v)) throw new Error(f.label+' 必须是有限数值或 null。');
        if (v<f.min||v>f.max||(f.exclusiveMin&&v===f.min)) throw new Error(f.label+' 超出允许输入范围。');
        if (f.key==='dmax'&&v>=1) throw new Error('Dmax 必须小于 1。');
        if (f.key==='directEvents'&&!Number.isInteger(v)) throw new Error('充电次数必须为正整数。');
      } else if (f.type==='text') {
        if(typeof v!=='string'||v.length>f.maxLength) throw new Error(f.label+' 文本不合法或过长。');
      } else if (!f.options.some(([value])=>value===v)) throw new Error(f.label+' 选项不合法。');
    }
    return p;
  }
  function parseProject(text) {
    if(typeof text!=='string'||text.length>250000) throw new Error('JSON 文件为空或过大（上限 250 KB）。');
    return validateProject(JSON.parse(text));
  }
  function serializeProject(project) { validateProject(project); return JSON.stringify(project,null,2)+'\n'; }
  function calculate(project) {
    const result={errors:[],missing:[],warnings:[],timing:null,bias:[],power:[],boot:null,overall:'预算未闭合',hardwareValidated:false};
    const issue=(list,code,message)=>result[list].push({code,message});
    try {validateProject(project);} catch(e) {issue('errors','schema',e.message);return result;}
    const p=project.params;
    for(const f of M.fields) if(f.type==='number'&&!f.optional&&!(p.outputMode==='rail'&&['highAvailable_V','lowAvailable_V'].includes(f.key))&&p[f.key]===null) issue('errors','required_'+f.key,f.label+' 不能为空。');
    if(result.errors.length) return result;
    if(p.vout_V>=p.vin_V) issue('errors','duty','标称 D≥1；该 Buck 工况没有有效补电窗口。');
    if(p.vinMin_V===null||p.vinMax_V===null) issue('missing','vin_range','输入电压最小/最大范围尚未确定。');
    if(p.vinMin_V!==null&&p.vinMin_V>p.vin_V||p.vinMax_V!==null&&p.vinMax_V<p.vin_V) issue('errors','vin_range_order','Vin 最小值、标称值、最大值顺序不一致。');
    if(p.vinMin_V!==null&&p.vout_V>=p.vinMin_V) issue('errors','vin_min_duty','最低输入不高于输出，不满足全输入范围 Buck 降压条件。');
    if(p.dmax!==null&&p.vinMin_V!==null&&p.dmax<p.vout_V/p.vinMin_V) issue('errors','dmax_range','Dmax 小于最低输入下的理想占空比。');
    const T=1000/p.frequency_kHz, D=p.vout_V/p.vin_V;
    if(!Number.isFinite(T)||!Number.isFinite(D)) {issue('errors','overflow','输入导致数值溢出。');return result;}
    if(result.errors.length) return result;
    const nominalWindow=(1-D)*T;
    const actualWindow=p.deadTime_ns!==null&&p.nodeDelay_ns!==null?nominalWindow-(p.deadTime_ns+p.nodeDelay_ns)/1000:null;
    const minWindow=p.dmax!==null&&p.deadTime_ns!==null&&p.nodeDelay_ns!==null?(1-p.dmax)*T-(p.deadTime_ns+p.nodeDelay_ns)/1000:null;
    result.timing={period_us:T,duty:D,ton_us:D*T,nominalWindow_us:nominalWindow,actualWindow_us:actualWindow,minWindow_us:minWindow};
    for(const k of ['dmax','deadTime_ns','nodeDelay_ns','maxNoRefresh_us','r9_Ohm','bootPath_Ohm','hbStart_V','otherLeak_mA']) {
      if(p[k]===null) issue('missing',k,M.fields.find(f=>f.key===k).label+' 尚未确定。');
    }
    if(p.dmax!==null&&p.dmax<D) issue('errors','dmax_low','Dmax 小于标称占空比，工况不一致。');
    if(actualWindow!==null&&actualWindow<=0||minWindow!==null&&minWindow<=0) issue('errors','window','扣除死区和延迟后补电窗口不足。');
    const requiredHold=(p.dmax===null?D:p.dmax)*T;
    if(p.maxNoRefresh_us!==null&&p.maxNoRefresh_us<requiredHold-1e-12) issue('errors','hold_short','最长不补电时间短于已输入占空比的导通时间。');
    for(const k of ['fetVdsMax_V','fetVgsMax_V','fetVgsMin_V','driverHsMax_V','driverHsMin_V','driverMin_V','driverMax_V','hbMin_V','hbMax_V','vddUvlo_V','hbUvlo_V','vdsPeak_V','hsPeak_V','hsValley_V']) if(p[k]===null) issue('missing',k,M.fields.find(f=>f.key===k).label+' 待校核。');
    if(!p.deviceSource.trim()) issue('missing','device_source','器件参数来源及适用条件待补。');
    if(p.fetVdsMax_V!==null&&Math.max(p.vinMax_V??p.vin_V,p.vdsPeak_V??p.vin_V)>=p.fetVdsMax_V) issue('errors','vds_rating','输入/最坏 VDS 达到或超过当前功率管 VDS 额定。');
    if(p.driverHsMax_V!==null&&Math.max(p.vinMax_V??p.vin_V,p.hsPeak_V??p.vin_V)>=p.driverHsMax_V) issue('errors','hs_rating','输入/最坏 HS 达到或超过当前驱动器高侧电压能力。');
    if(p.driverHsMin_V!==null&&p.hsValley_V!==null&&p.hsValley_V<p.driverHsMin_V) issue('errors','hs_negative','HS 负向尖峰低于当前驱动器允许值。');
    if(p.driverMin_V!==null&&p.vdd_V<p.driverMin_V||p.driverMax_V!==null&&p.vdd_V>p.driverMax_V) issue('errors','vdd_range','VDD 超出所填驱动器推荐范围。');
    if(p.driverMin_V!==null&&p.driverMax_V!==null&&p.driverMin_V>=p.driverMax_V||p.hbMin_V!==null&&p.hbMax_V!==null&&p.hbMin_V>=p.hbMax_V) issue('errors','rail_bounds','驱动供电范围的上下界不一致。');
    if(p.hbStart_V!==null&&(p.hbMin_V!==null&&p.hbStart_V<p.hbMin_V||p.hbMax_V!==null&&p.hbStart_V>p.hbMax_V)) issue('errors','hb_range','HB 起始电压超出所填驱动器推荐范围。');
    if(p.fetVgsMax_V!==null&&p.vgsTarget_V>=p.fetVgsMax_V||p.vgsOff_V!==null&&p.fetVgsMin_V!==null&&p.vgsOff_V<=p.fetVgsMin_V) issue('errors','vgs_abs','VGS 目标触及或超过所填功率管绝对最大边界。');
    if(p.vgsOff_V!==null&&p.vgsOff_V>=p.vgsTarget_V) issue('errors','gate_targets','关断目标应低于正向导通目标。');
    if(p.vddUvlo_V!==null&&p.vdd_V<=p.vddUvlo_V||p.hbUvlo_V!==null&&p.hbStart_V!==null&&p.hbStart_V<=p.hbUvlo_V) issue('errors','uvlo','供电没有高于所填 UVLO 上升阈值上界。');
    if(p.fetName==='EPC2366'&&p.vgsTarget_V!==5) issue('warnings','vgs_reference','EPC2366 的预设 Qg 与 IGSS 条件为 +5 V；更改目标后需要新的依据。');
    let high=p.highAvailable_V,low=p.lowAvailable_V;
    if(p.outputMode==='rail') {
      high=p.hbStart_V!==null&&p.highDrop_V!==null?p.hbStart_V-p.highDrop_V:null;
      low=p.lowDrop_V!==null?p.vdd_V-p.lowDrop_V:null;
      if(high===null||low===null) issue('missing','output_drop','供电推导模式缺少 HB 起始或输出压降；不使用手填可用电平替代。');
    }
    result.available={high_V:high,low_V:low,mode:p.outputMode};
    if(high!==null&&(high>p.vdd_V||p.hbStart_V!==null&&high>p.hbStart_V)||low!==null&&low>p.vdd_V) issue('errors','output_rail','可用输出电平高于输入供电/已填 HB 电压，电压假设不一致。');
    for(const [side,a,b,c,d,cap,available] of [['高侧',1,2,3,4,p.c1_nF,high],['低侧',5,6,7,8,p.c2_nF,low]]) {
      if(available===null) continue;
      const rOn=p['r'+a+'_Ohm'],rOff=p['r'+b+'_Ohm'],rBias=p['r'+c+'_Ohm'],rPd=p['r'+d+'_Ohm'];
      const head=available-p.vgsTarget_V, pd=p.vgsTarget_V/rPd*1000, needed=p.iz_mA+pd+p.igss_mA;
      const rTotalMax=head>0?head/(needed/1000):null;
      const current=head>0?head/(rOn+rBias)*1000:null;
      const tau=rOn*rBias/(rOn+rBias)*cap/1000;
      result.bias.push({side,needed_mA:needed,pulldown_mA:pd,headroom_V:head,rTotalMax_Ohm:rTotalMax,rBiasMax_Ohm:rTotalMax===null?null:rTotalMax-rOn,steadyCurrent_mA:current,zenerRemaining_mA:current===null?null:current-pd-p.igss_mA,offApprox_Ohm:rOn*rOff/(rOn+rOff),tau_us:tau});
      if(head<=0) issue('errors','head_'+side,side+' 可用输出不高于 VGS 目标，无正向偏置余量。');
      else if(rOn+rBias>rTotalMax) issue('warnings','bias_'+side,side+' R'+c+' 的稳态偏置电流预算不足。');
      const onTime=(side==='高侧'?D:1-D)*T;
      if(tau>onTime) issue('warnings','tau_'+side,side+' 简化 RC 时间常数大于导通时间；不能用稳态电流×ton 代替完整网络电荷。');
    }
    if(p.zTest_mA!==null&&p.iz_mA!==p.zTest_mA) issue('warnings','iz_reference','所填 IZ 与 Zener 规格测试电流不同；不能据此保证标称钳位值。');
    if(p.fetName==='EPC2366'&&p.igss_mA<9) issue('warnings','igss_case','IGSS 预算低于 EPC2366 +5 V/125°C 的 9 mA 设计值；需声明温度适用范围。');
    for(const k of ['zPositive_V','zNegativeHigh_V','zNegativeLow_V','zTolerance_pct','zTest_mA','zVf_V','zVfTest_mA']) if(p[k]===null) issue('missing',k,M.fields.find(f=>f.key===k).label+' 待核验。');
    if(!p.zSource.trim()) issue('missing','z_source','Zener 参数来源与条件待补。');
    if(p.zPositive_V!==null&&p.zNegativeHigh_V!==null&&p.zNegativeLow_V!==null&&p.zTolerance_pct!==null&&p.zVf_V!==null) {
      const m=1+p.zTolerance_pct/100;
      result.clamp={positive_V:p.zPositive_V*m+p.zVf_V,negativeHigh_V:-(p.zNegativeHigh_V*m+p.zVf_V),negativeLow_V:-(p.zNegativeLow_V*m+p.zVf_V)};
      issue('warnings','clamp_only','Zener 容差与 Vf 算术和仅为参考，测试电流可能不同，不是瞬态峰值或固定栅压保证。');
      if(p.fetVgsMax_V!==null&&result.clamp.positive_V>=p.fetVgsMax_V||p.fetVgsMin_V!==null&&Math.min(result.clamp.negativeHigh_V,result.clamp.negativeLow_V)<=p.fetVgsMin_V) issue('warnings','clamp_rating','Zener 参考算术和已触及所填 VGS 额定；需重新选型及核验。');
    }
    if(!p.budgetSource.trim()) issue('missing','budget_source','缺少电流预算依据与工况。');
    if(p.effectiveFactor===null) issue('missing','capacity_factor','有效容量系数未知；标称容量不能自动通过。');
    else if(!p.effectiveSource.trim()) issue('missing','capacity_source','容量系数没有来源，不参与容量判定。');
    const eff=p.effectiveFactor!==null&&p.effectiveSource.trim()?p.bootNominal_nF*(1-p.bootTolerance_pct/100)*p.effectiveFactor:null;
    let q=null;
    if(p.mode==='network') {
      if(p.qNetwork_nC===null) issue('missing','network_charge','完整双 Zener 网络 Qnetwork 缺失，不能用 Qg 替代。');
      else if(!p.qNetworkSource.trim()) issue('missing','network_source','Qnetwork 缺少来源与区间说明。');
      else q=p.qNetwork_nC;
    } else {
      q=p.qg_nC*p.directEvents;
      issue('warnings','direct_only','普通直接驱动参考模式不适用于完整双 Zener 网络；结果不能用于本设计验收。');
    }
    let qDriver=null;
    if(p.qDriver_nC===null) issue('missing','driver_charge','缺少同一不补电区间的驱动器自身电荷 Qdriver；全周期平均电流参考不能直接替代。');
    else if(!p.qDriverSource.trim()) issue('missing','driver_source','Qdriver 缺少来源与区间说明。');
    else qDriver=p.qDriver_nC;
    const total=q!==null&&qDriver!==null&&p.maxNoRefresh_us!==null&&p.otherLeak_mA!==null?q+qDriver+p.otherLeak_mA*p.maxNoRefresh_us:null;
    const minCap=total===null?null:total/p.droop_V;
    const predicted=total!==null&&eff!==null?total/eff:null;
    const headroom=p.hbStart_V===null||p.hbMin_V===null?null:p.hbStart_V-p.hbMin_V-p.droop_V;
    const valley=p.hbStart_V!==null&&predicted!==null?p.hbStart_V-predicted:null;
    if(headroom!==null&&headroom<=0) issue('errors','hb_headroom','HB 起始−压降目标不高于推荐最低值，压降余量不足。');
    if(valley!==null&&p.hbMin_V!==null&&valley<p.hbMin_V) issue('errors','hb_valley','预计 HB 谷值低于所填最低值。');
    if(valley!==null&&p.hbUvlo_V!==null&&valley<=p.hbUvlo_V) issue('warnings','uvlo_valley','预计 HB 谷值不高于 UVLO 上升上界；需另核对下降阈值及迟滞。');
    let status='缺少数据';
    if(predicted!==null) {
      if(predicted>p.droop_V) {status='压降预算不足';issue('warnings','capacity_small','按输入电荷计算，自举有效容量不足以满足压降目标。');}
      else status='仅压降算式满足；未验证补电';
    }
    if(p.mode==='direct') status='直接驱动参考；不适用本网络';
    const tauBoot=eff!==null&&p.bootPath_Ohm!==null?p.bootPath_Ohm*eff/1000:null;
    const recovery=tauBoot!==null&&minWindow!==null&&minWindow>0?-Math.expm1(-minWindow/tauBoot):null;
    result.boot={qNetworkOrReference_nC:q,qTotal_nC:total,minEffective_nF:minCap,effective_nF:eff,predictedDroop_V:predicted,targetHeadroom_V:headroom,predictedValley_V:valley,tau_us:tauBoot,idealRecovery:recovery,status};
    const missingRms=[];
    for(let i=1;i<=8;i++) {
      const v=p['rmsR'+i+'_V'];
      const power=v===null?null:v*v/p['r'+i+'_Ohm'];
      const limit=p.ratedPower_W*p.powerFraction;
      result.power.push({part:'R'+i,rms_V:v,power_W:power,limit_W:limit,status:power===null?'待波形 RMS':power>limit?'超过所选比较限值':'平均值在所选限值内；脉冲/温升待验'});
      if(power===null) missingRms.push('R'+i);
      else if(power>limit) issue('warnings','power_R'+i,'R'+i+' 平均功耗超过所选比较限值。');
    }
    if(missingRms.length) issue('missing','rms','缺少完整周期自身电压 RMS：'+missingRms.join('、')+'。');
    if(result.power.some(x=>x.power_W!==null)&&!p.rmsSource.trim()) issue('missing','rms_source','已输入 RMS，但缺少来源与完整周期范围。');
    issue('warnings','hardware','首次脉冲、停波重启、负峰值、死区、误导通、重复脉冲和温升均未验证。软件不生成硬件通过结论。');
    function finiteTree(x) { if(typeof x==='number')return Number.isFinite(x);if(x&&typeof x==='object')return Object.values(x).every(finiteTree);return true; }
    if(!finiteTree([result.timing,result.bias,result.boot,result.power])) {
      result.timing=null;result.bias=[];result.boot=null;result.power=[];
      issue('errors','overflow','计算结果超出有限数值范围，请检查单位和极端输入。');
    }
    result.overall=result.errors.length?'输入或约束存在问题':result.missing.length?'预算未闭合':'输入预算已列出；硬件仍未验证';
    return result;
  }
  function fmt(x,d=4) { return typeof x==='number'&&Number.isFinite(x)?Number(x.toPrecision(d)).toString():'未知'; }
  function report(project) {
    validateProject(project);
    const r=calculate(project), p=project.params;
    const lines=['# 双 Zener 驱动参数初选报告','','工具版本：'+M.version,'项目：'+project.name,'状态：'+r.overall,'','参数初选记录，不是已验证硬件/仿真。所有数值依赖所填工况与来源；无自动认证。','','## 输入与单位',''];
    for(const f of M.fields) lines.push('- '+f.label+'：'+(p[f.key]===null?'缺失':String(p[f.key])));
    lines.push('','## 选型状态','','| 位号 | 料号 | 规格 | 状态 |','| --- | --- | --- | --- |');
    for(const row of M.bom(p)) lines.push('| '+row.join(' | ')+' |');
    lines.push('','## 计算结果','');
    if(r.timing) lines.push('T='+fmt(r.timing.period_us)+' μs；Dnom='+fmt(r.timing.duty)+'；ton='+fmt(r.timing.ton_us)+' μs。','名义补电窗口='+fmt(r.timing.nominalWindow_us)+' μs；Dmax 最短有效补电窗口='+fmt(r.timing.minWindow_us)+' μs。');
    for(const b of r.bias) lines.push(b.side+'：I需='+fmt(b.needed_mA)+' mA；R总上限='+fmt(b.rTotalMax_Ohm)+' Ω；R偏置上限='+fmt(b.rBiasMax_Ohm)+' Ω；稳态支路电流='+fmt(b.steadyCurrent_mA)+' mA；关断外阻近似='+fmt(b.offApprox_Ohm)+' Ω；τ≈'+fmt(b.tau_us)+' μs。');
    if(r.boot) lines.push('自举：'+r.boot.status+'。','Qtotal='+fmt(r.boot.qTotal_nC)+' nC；Cmin_eff='+fmt(r.boot.minEffective_nF)+' nF；Ceff='+fmt(r.boot.effective_nF)+' nF；预测压降='+fmt(r.boot.predictedDroop_V)+' V；HB目标余量='+fmt(r.boot.targetHeadroom_V)+' V；预计谷值='+fmt(r.boot.predictedValley_V)+' V。','理想无负载 RC 恢复比例='+fmt(r.boot.idealRecovery)+'；仅为量级，不保证实际充电。');
    for(const x of r.power) lines.push(x.part+'：'+fmt(x.power_W)+' W；比较限值='+fmt(x.limit_W)+' W；'+x.status+'。');
    for(const [key,title] of [['errors','输入/约束问题'],['missing','缺失项'],['warnings','风险与验证']]) {lines.push('','## '+title,'');for(const x of r[key])lines.push('- '+x.message);if(!r[key].length) lines.push('无新增条目；这不代表硬件通过。');}
    if(r.available)lines.push('实际用于计算的高/低侧可用电平：'+fmt(r.available.high_V)+' / '+fmt(r.available.low_V)+' V；输入模式='+r.available.mode+'。');
    if(r.clamp)lines.push('Zener 参考算术和（非保证峰值）：正向 '+fmt(r.clamp.positive_V)+' V；负向高/低侧 '+fmt(r.clamp.negativeHigh_V)+' / '+fmt(r.clamp.negativeLow_V)+' V。');
    lines.push('','## 数值代入过程','');
    if(r.timing) lines.push('T = 1000 / '+p.frequency_kHz+' = '+fmt(r.timing.period_us)+' μs。','Dnom = '+p.vout_V+' / '+p.vin_V+' = '+fmt(r.timing.duty)+'。','ton = '+fmt(r.timing.duty)+' × '+fmt(r.timing.period_us)+' = '+fmt(r.timing.ton_us)+' μs。');
    r.bias.forEach((b,i)=>{const n=i?5:1; lines.push(b.side+' I需 = '+p.iz_mA+' + '+p.vgsTarget_V+' / '+p['r'+(n+3)+'_Ohm']+' × 1000 + '+p.igss_mA+' = '+fmt(b.needed_mA)+' mA。',b.side+' R偏置上限 = '+fmt(b.headroom_V)+' / ('+fmt(b.needed_mA)+' / 1000) − '+p['r'+n+'_Ohm']+' = '+fmt(b.rBiasMax_Ohm)+' Ω。');});
    if(r.boot&&r.boot.qTotal_nC!==null) lines.push('Qtotal = '+fmt(r.boot.qNetworkOrReference_nC)+' + '+p.qDriver_nC+' + '+p.otherLeak_mA+' × '+p.maxNoRefresh_us+' = '+fmt(r.boot.qTotal_nC)+' nC。','Cmin_eff = '+fmt(r.boot.qTotal_nC)+' / '+p.droop_V+' = '+fmt(r.boot.minEffective_nF)+' nF。');
    else lines.push('Qtotal 或关键预算未闭合，不能给出完整自举电容最低值的数值代入。');
    if(r.boot&&r.boot.effective_nF!==null) lines.push('Ceff = '+p.bootNominal_nF+' × (1 − '+p.bootTolerance_pct+'/100) × '+p.effectiveFactor+' = '+fmt(r.boot.effective_nF)+' nF。');
    r.power.filter(x=>x.power_W!==null).forEach(x=>lines.push(x.part+' P = '+x.rms_V+'² / '+p[x.part.toLowerCase()+'_Ohm']+' = '+fmt(x.power_W)+' W。'));
    lines.push('','## 假设与适用边界','',...M.activeNotices(p).map(x=>'- '+x),'','## 公式','',...M.formulae.map(x=>'- '+x),'','## 示例原始资料（在线链接，离线计算不访问；自定义器件另填来源）','',...M.sources.map(([label,url])=>'- ['+label+']('+url+')'));
    return lines.join('\n')+'\n';
  }
  return {validateProject,parseProject,serializeProject,calculate,report,fmt};
});
