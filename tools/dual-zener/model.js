/* Offline data model. Units are explicit in field names and labels. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BuckModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fields = [];
  function num(key, label, group, value, min, max, help, optional = false, exclusiveMin = false) {
    fields.push({key, label, group, value, min, max, help, optional, exclusiveMin, type: 'number'});
  }
  function str(key, label, group, value, help) {
    fields.push({key, label, group, value, help, type: 'text', maxLength: 1200});
  }
  num('vin_V','输入 Vin / V','base',12,0,1e12,'功率母线，不能直接接栅极；另需核对器件耐压及尖峰。',false,true);
  num('vinMin_V','输入最低 / V','base',null,0,1e12,'用于占空比与补电边界；未知留空，不能默认等于标称。',true,true);
  num('vinMax_V','输入最高 / V','base',null,0,1e12,'用于器件耐压筛选，仍需叠加实测/估算尖峰。',true,true);
  num('vout_V','输出 Vout / V','base',3.3,0,1e12,'仅用理想 Buck 比值估算标称占空比；不限于示例的 3.3 V。',false,true);
  num('iout_A','输出电流 / A','base',12,0,1000,'设计目标；不据此宣称已满足温升。');
  num('frequency_kHz','开关频率 / kHz','base',500,0,100000,'本次预设 500 kHz，可编辑。',false,true);
  num('dmax','最大占空比 Dmax / 0–1','timing',null,0,1,'必须独立给定，不能自动等于 Vout/Vin。',true,true);
  num('deadTime_ns','补电窗口内总死区 / ns','timing',null,0,1e9,'只填侵占该窗口的死区总和；未知留空，已确认可填 0。',true);
  num('nodeDelay_ns','节点拉低及其他延迟 / ns','timing',null,0,1e9,'在扣除死区后额外失去的补电时间。',true);
  num('maxNoRefresh_us','最长连续不补电时间 / μs','timing',null,0,1e12,'覆盖停波、突变等工况；不是默认 ton。Qnetwork 必须覆盖此整个区间。',true,true);
  str('fetName','功率管型号','devices','EPC2366','自定义方案可填其他型号；离线工具不查询器件数据库。');
  str('driverName','驱动器型号','devices','UCC27282DRC','所有额定值由下方参数给出；不能只改型号而沿用旧规格。');
  num('fetVdsMax_V','功率管 VDS 额定 / V','devices',40,0,1e12,'未知留空；低于额定只是必要条件，不代表可承受全部尖峰。',true,true);
  num('fetVgsMax_V','功率管 VGS 正绝对最大 / V','devices',6,0,1e6,'不是正常目标电压。',true,true);
  num('fetVgsMin_V','功率管 VGS 负绝对最小 / V','devices',-4,-1e6,0,'按所选器件手册输入，未知留空。',true);
  num('vgsOff_V','关断 VGS 目标 / V','devices',-2,-1e6,1e6,'本网络的负压只是暂态研究目标，不是独立稳压负电源。',true);
  num('vdsPeak_V','最坏 VDS 峰值 / V','devices',null,0,1e12,'含输入上限和开关过冲；未填时仅比较 Vin，保持尖峰待核验。',true);
  num('driverHsMax_V','驱动器 HS 推荐最高 / V','devices',100,0,1e12,'高侧节点能力，不是 VDD 或 HB-HS 额定。',true,true);
  num('driverHsMin_V','驱动器 HS 推荐最低 / V','devices',-8,-1e12,0,'需明确脉宽条件；瞬态绝对最大不能代替持续推荐范围。',true);
  num('hsPeak_V','最坏 HS 最高 / V','devices',null,0,1e12,'未知时仅按 Vin 作必要条件检查。',true);
  num('hsValley_V','最坏 HS 最低 / V','devices',null,-1e12,1e12,'包含负向尖峰；未知保持警示。',true);
  num('driverMin_V','驱动器 VDD 推荐最低 / V','devices',5.5,0,1e6,'以当前器件资料为准。',true,true);
  num('driverMax_V','驱动器 VDD 推荐最高 / V','devices',16,0,1e6,'以当前器件资料为准。',true,true);
  num('hbMax_V','驱动器 HB-HS 推荐最高 / V','devices',16,0,1e6,'与 HS 对地耐压分开输入。',true,true);
  num('vddUvlo_V','VDD UVLO 上升阈值上界 / V','devices',null,0,1e6,'未知留空；UVLO 与推荐最低工作电压分开核对。',true);
  num('hbUvlo_V','HB-HS UVLO 上升阈值上界 / V','devices',null,0,1e6,'未知留空；需计入容差、迟滞与启动条件。',true);
  str('deviceSource','器件额定、Qg 与栅漏来源','devices','EPC2366 2026-06-12；UCC27282 Rev.B。Qg：20V/30A/0→5V；IGSS：+5V/125°C 设计值。','换器件时逐项更新；不按型号自动填数。');
  fields.push({key:'outputMode',label:'可用输出电压输入方式',group:'driver',type:'select',value:'available',options:[['available','直接填写已扣压降的输出电平'],['rail','从供电减去一次输出压降']]});
  num('highDrop_V','高侧输出压降 / V','driver',null,0,1e6,'仅“从供电减去”模式使用：高侧可用=HB起始−此值。',true);
  num('lowDrop_V','低侧输出压降 / V','driver',null,0,1e6,'仅“从供电减去”模式使用：低侧可用=VDD−此值；不重复扣除。',true);
  num('vdd_V','驱动供电 VDD / V','driver',8,0,1e6,'示例暂定 8 V；按当前器件推荐范围复核。',false,true);
  num('highAvailable_V','高侧可用输出高电平 / V','driver',7,0,1e6,'相对 HS，已含输出级压降的端口电压；暂定 7 V，不再扣 0.42 V。',false,true);
  num('lowAvailable_V','低侧可用输出高电平 / V','driver',8,0,1e6,'相对低侧 Source；暂定 8 V，实际会受输出压降影响。',false,true);
  num('vgsTarget_V','正向 VGS 目标 / V','driver',5,0,1e6,'暂定 +5 V；双 Zener 不是固定 5 V 精密电源。',false,true);
  num('iz_mA','暂用 Zener 电流 / mA','driver',1,0,1000,'1 mA 只是初算假设；BZX384 电压规格在 5 mA 条件。');
  num('igss_mA','正向栅漏预算 / mA','driver',9,0,1000,'EPC2366：4 mA 最大@5 V/25°C；9 mA@125°C 为设计值。');
  str('zPositiveName','正向钳位 Zener 型号','zener','BZX384-B4V3','Dz1/Dz3；示例为保留初选。');
  str('zNegativeHighName','高侧负向保护 Zener 型号','zener','BZX384-B2V4','Dz2；示例仍为候选。');
  str('zNegativeLowName','低侧负向保护 Zener 型号','zener','BZX384-B2V4','Dz4；示例为保留初选。');
  num('zPositive_V','正向钳位管标称 Vz / V','zener',4.3,0,1e6,'不是直接等于正向 VGS。',true,true);
  num('zNegativeHigh_V','高侧负向保护管标称 Vz / V','zener',2.4,0,1e6,'还需加另一只管的正向压降。',true,true);
  num('zNegativeLow_V','低侧负向保护管标称 Vz / V','zener',2.4,0,1e6,'两路可分别设定。',true,true);
  num('zTolerance_pct','Zener Vz 容差 / %','zener',2,0,99,'这里只作共同容差简化；不同器件请用较宽值并另核对。',true);
  num('zTest_mA','Vz 规格测试电流 / mA','zener',5,0,1e6,'与实际 IZ 分开，不把测试电流误叫保证维持电流。',true,true);
  num('zVf_V','另一只 Zener 正向 Vf 参考 / V','zener',0.9,0,1e6,'示例用最大 0.9 V@10 mA；与 Vz 5 mA 条件不同，算术和不是钳位保证。',true);
  num('zVfTest_mA','Vf 参考测试电流 / mA','zener',10,0,1e6,'须结合实际波形电流重取 Vf。',true,true);
  str('zSource','Zener 参数来源与适用条件','zener','BZX384：Vz@5mA；VF max 0.9V@10mA、1.1V@100mA。','钳位动态阻抗、温度、结电容和尖峰仍须检查。');
  for (let i=1;i<=8;i++) {
    const values=[20,10,100,10000,20,10,100,10000];
    const roles=['开通主路','关断二极管支路','C1 并联偏置','G-S 下拉','开通主路','关断二极管支路','C2 并联偏置','G-S 下拉'];
    num('r'+i+'_Ohm','R'+i+' '+roles[i-1]+' / Ω','resistors',values[i-1],0,1e9,'0805、1%、0.125 W 初选；修改阻值后原料号不再对应。',false,true);
  }
  num('c1_nF','C1 / nF','resistors',100,0,1e9,'TDK C3216C0G1H104J160AA，C0G、50 V、5%、1206。',false,true);
  num('c2_nF','C2 / nF','resistors',100,0,1e9,'本次两路均为 100 nF；取代历史 C2=68 nF。',false,true);
  num('bootNominal_nF','Cboot 标称容量 / nF','boot',470,0,1e9,'HB-HS 电容：C2012X7R1H474K125AB，0805、50 V、X7R。',false,true);
  num('bootTolerance_pct','Cboot 初始负容差 / %','boot',10,0,99.999,'与下面系数分开计算，不要重复计入容差。');
  num('effectiveFactor','容量保留系数 / 0–1','boot',null,0,1,'偏压/温度/老化后的保留比例，不含初始容差；必须有来源。未知留空。',true,true);
  str('effectiveSource','容量系数来源与工况','boot','','记录官方曲线/测量、约 7 V 偏压、温度、频率及老化条件；无来源不判定容量。');
  num('droop_V','允许自举压降目标 / V','boot',0.3,0,1e6,'本次目标 0.3 V；还须满足 HB 电压余量。',false,true);
  num('hbStart_V','不补电区间开始 HB-HS / V','boot',null,0,1e6,'与 HO 高电平不是同一量，不能自动把 7 V 填入。',true,true);
  num('hbMin_V','HB-HS 推荐最低值 / V','boot',5.5,0,1e6,'当前驱动器参数；示例 UCC27282 为 5.5 V，不是 UVLO。',true,true);
  num('r9_Ohm','R9 / Ω','boot',null,0,1e9,'位置与实际数值待明确；不自动并入实际路径电阻。',true);
  num('bootPath_Ohm','实际自举充电路径总电阻 / Ω','boot',null,0,1e9,'合计电源/二极管动态电阻/走线/串阻；已包含的 R9 不重复相加。',true,true);
  fields.push({key:'mode',label:'电荷预算模式',group:'charge',type:'select',value:'network',options:[['network','完整双 Zener 网络（默认）'],['direct','普通直接驱动参考（不适用本网络）']]});
  num('qNetwork_nC','Qnetwork / nC（整个不补电区间）','charge',null,0,1e12,'驱动向整个高侧网络供出的正电荷积分 ∫max(iHO→network,0)dt，包含栅极/C1/Zener/下拉。',true);
  str('qNetworkSource','Qnetwork 来源、工况与积分边界','charge','','须覆盖当前最长不补电时间及其中全部脉冲；修改工况后重新确认。');
  num('qDriver_nC','Qdriver / nC（整个不补电区间）','charge',null,0,1e12,'驱动器自身在同一最长不补电区间消耗的电荷，不含已计入 Qnetwork 的外部网络；须由适用规格、模型或测量支持。',true);
  str('qDriverSource','Qdriver 来源与区间边界','charge','','全周期平均电流不能直接按导通时长截取，须覆盖内部切换消耗并避免重复计数。');
  num('iHb_mA','HB 全周期平均电流参考 / mA（不参与预算）','charge',4,0,1e6,'4 mA 是 12 V、500 kHz 空载参考；整周期 2 μs 对应 8 nC 参考，不保证 0.55 μs 内部消耗为 2.2 nC。');
  num('otherLeak_mA','其他未计入漏电预算 / mA','charge',null,0,1e6,'只含 Qnetwork 和 HB 电流以外项目；已确认可填 0，不默认漏电为零。',true);
  num('qg_nC','直接驱动参考 Qg / nC','charge',18,0,1e12,'15 typ / 18 max nC：20 V、30 A、0→5 V；不覆盖负压双 Zener 网络。');
  num('directEvents','直接驱动充电次数','charge',1,1,1e6,'仅参考模式使用，次数须覆盖整个不补电区间。');
  str('budgetSource','电流预算依据与适用范围','charge','HB 4 mA：UCC27282，12 V/500 kHz、输出空载的最大值参考；较低电压需复核。','注明温度、频率、驱动供电、其他漏电及是否重复计入。');
  num('ratedPower_W','电阻名义额定功率 / W','power',0.125,0,1e6,'Yageo 规格为 0.125 W@70°C，实际温度降额及重复脉冲仍需检查。',false,true);
  fields.push({key:'powerFraction',label:'平均功耗比较比例',group:'power',type:'select-number',value:1,options:[[1,'100% 额定（仍须温度降额）'],[0.5,'50% 额定（可选工程裕量）']]});
  for(let i=1;i<=8;i++) num('rmsR'+i+'_V','R'+i+' 自身两端电压 RMS / V','power',null,0,1e6,i===3||i===7?'等于对应 C1/C2 两端电压 RMS，必须包含完整周期。':i===4||i===8?'等于该管完整周期 VGS RMS，包含正负压与关断。':'只用该电阻自身支路电压；R2/R6 不能包括二极管压降。',true);
  str('rmsSource','RMS 来源与完整周期范围','power','','记录通道/单位/稳态周期数；启动与故障脉冲单独检查。本工具不读取 CSV、不运行 SPICE。');
  const sources = [
    ['EPC2366 数据手册（2026-06-12）','https://epc-co.com/epc/portals/0/epc/documents/datasheets/EPC2366_datasheet.pdf'],
    ['UCC27282 数据手册（Rev. B）','https://www.ti.com/lit/gpn/UCC27282'],
    ['EPC：二极管加速关断的限制（2023-04-27）','https://forum.epc-co.com/t/epc2052-for-motor-drive/499'],
    ['BZX384 系列数据手册','https://assets.nexperia.com/documents/data-sheet/BZX384_SER.pdf'],
    ['PMEG2010ER 数据手册','https://assets.nexperia.com/documents/data-sheet/PMEG2010ER.pdf'],
    ['TDK Cboot 0805','https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C2012X7R1H474K125AB'],
    ['TDK C1/C2 1206','https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C3216C0G1H104J160AA'],
    ['TI SLPA010，第 9 页硅 MOSFET 参考','https://www.ti.com/lit/an/slpa010/slpa010.pdf']
  ];
  const notices = [
    '参数初选记录，不是已验证硬件/仿真。只改 Vin/Vout 会沿用屏幕上的器件、频率和其他假设，不能完成完整驱动设计。',
    '实际拓扑：HO → [R1 ∥ (D1 串 R2)] → X → [R3 ∥ C1] → Gate；G-S 为 R4 ∥ 反向串联双 Zener。LO 对应 R5/R6/D2/R7/C2/R8。这是串联耦合偏置网络，不是普通电阻分压器。',
    'D1/D2 阳极朝 X、阴极横杠朝驱动器，是关断支路；不是自举 D3。Cboot 接 HB-HS。',
    'EPC 官方不建议在常规 GaN 栅极用二极管加速关断：低阈值下二极管压降会干扰关断尾段；无独立开关引脚时建议单电阻。本 C 耦合负压网络不同，不能直接判失败，也不属于 EPC 认可。PMEG2010ER 仍为未确认、待验证候选。',
    'EPC2366：40 V；VGS 绝对最大 +6/−4 V，推荐 +5/0 V，负压并非必需。88 A 额定不能证明自然散热 12 A。反向栅漏 3 mA 最大仅在 −2 V/25°C，不是约 −3 V 的保证。',
    'BZX384-B4V3 的 4.21–4.39 V 只在 IZ=5 mA；正向 VF 最大 0.9 V@10 mA、1.1 V@100 mA。双 Zener 钳位随电流和温度变化，1 mA 不是保证维持电流。',
    'PMEG2010ER：20 V、1 A 级、SOD123W；Cd 典型 175 pF@1 V、65 pF@10 V（1 MHz/25°C）。1 A 规格含 20 kHz 等测试条件，不保证 500 kHz 重复关断脉冲；非重复浪涌额定也不能用于证明重复脉冲。',
    'UCC27282 的输出压降最大 0.42 V 在 12 V、100 mA 条件，不可当 7 V 通用值。可用输出电平已包含输出级压降，计算不再重复扣除。',
    'TI SLPA010 第 9 页仅支持硅 Buck 慢开快关思路。EPC2305 split driver 的 3.3/0.47 Ω 参考不能移植为本电路阻值依据。',
    '波形积分输入必须与当前工况一致。Qnetwork 不再叠加 Qg、C1×驱动电压或同一栅漏/下拉电荷。HB 预算与其他漏电也不能重复计入。'
  ];
  const formulae = [
    'T[μs]=1000/f[kHz]；Dnom=Vout/Vin；ton=Dnom×T；名义补电窗口=(1−Dnom)×T。',
    'Dmax 独立输入；最短补电窗口=(1−Dmax)×T−(总死区+节点拉低延迟)/1000。',
    '完整网络：Qtotal[nC]=Qnetwork[nC]+Qdriver[nC]+Iother[mA]×tNoRefresh[μs]。两项电荷覆盖同一不补电区间，且不可重复。',
    '直接驱动参考：Qtotal=Qg×充电次数+Qdriver+Iother×tNoRefresh；本网络不可据此验收。',
    'Cboot_min_eff[nF]=Qtotal[nC]/ΔV[V]；Ceff=Cnom×(1−初始负容差)×容量保留系数；预测压降=Qtotal/Ceff。',
    'HB 目标余量=HB起始−HB最低−压降目标；实际 HB 谷值估算=HB起始−Qtotal/Ceff。',
    'I需=IZ+VGS/Rpd+IGSS；R总上限=(V可用−VGS)/I需；R3/R7 上限=R总上限−R1/R5。',
    '稳态串联支路电流=(V可用−VGS)/(R1+R3)，仅作偏置筛选，不等于短脉冲实况。',
    '关断外部近似 R1∥R2；只在二极管充分导通、忽略压降时成立，不是准确速度倍率。',
    'C1 暂态量级 τ≈(R1∥R3)×C1；这是简化条件下的量级提示，不是非线性网络仿真。',
    '所有电阻 P=Vrms²/R=mean(vR(t)²)/R；R3/R7 用 vC1/vC2，R4/R8 用完整周期 VGS，R2/R6 只用自身电阻压降。',
    '充电路径 τboot=Rpath×Ceff；1−exp(−t窗口/τboot) 仅为理想无负载 RC 对电压差的恢复比例，不保证实际补电。'
  ];
  function defaultProject() { return {schemaVersion:1,name:'12V-3.3V / EPC2366 / 500kHz 初选',preset:'epc2366-20261026',params:Object.fromEntries(fields.map(f=>[f.key,f.value]))}; }
  function customProject() {
    const p=defaultProject();p.name='自定义双 Zener / 待填写';p.preset='custom';
    for(const f of fields) {
      if(['devices','driver','zener','resistors','boot','charge','power','base'].includes(f.group)) {
        if(f.type==='number')p.params[f.key]=null;
        if(f.type==='text')p.params[f.key]='';
      }
    }
    p.params.mode='network';p.params.outputMode='available';p.params.powerFraction=1;
    return p;
  }
  function activeNotices(p) {
    const general=[notices[0],notices[1],notices[2],notices[9], '本工具适用于所述同步 Buck 与串联耦合双 Zener 驱动，不是任意拓扑设计器。更换型号时必须更新额定值、Qg、栅漏与测试条件，Vin/Vout 本身不能决定全部参数。'];
    if(p.fetName==='EPC2366') general.push(notices[3],notices[4],notices[8]);
    if(p.zPositiveName==='BZX384-B4V3') general.push(notices[5]);
    if(p.driverName.startsWith('UCC27282')) general.push(notices[7]);
    if(p.fetName==='EPC2366') general.push(notices[6]);
    return general;
  }
  function bom(p) {
    const custom=p.fetName!=='EPC2366'||p.driverName!=='UCC27282DRC';
    const rows=[['上下管',p.fetName||'待定',(p.fetVdsMax_V??'未知')+' V；两颗',custom?'自定义，待验证':'已选，适用性与散热待验证'],['驱动器',p.driverName||'待定','独立半桥驱动','候选，实际工况待验证']];
    for (const [a,b,v,part] of [[1,5,20,'RC0805FR-0720RL'],[2,6,10,'RC0805FR-0710RL'],[3,7,100,'RC0805FR-07100RL'],[4,8,10000,'RC0805FR-0710KL']]) {
      const match=!custom&&p.ratedPower_W===0.125&&p['r'+a+'_Ohm']===v&&p['r'+b+'_Ohm']===v;
      rows.push(['R'+a+'/R'+b,match?part:'自定义，料号待选',(p['r'+a+'_Ohm']??'未知')+'/'+(p['r'+b+'_Ohm']??'未知')+' Ω；'+(p.ratedPower_W??'未知')+' W',match?'0805、1% 初选；重复脉冲/温升未验证':'按当前阻值与功率另选']);
    }
    rows.push(['C1/C2',!custom&&p.c1_nF===100&&p.c2_nF===100?'C3216C0G1H104J160AA':'料号待选',(p.c1_nF??'未知')+'/'+(p.c2_nF??'未知')+' nF',custom?'自定义，介质/额定/脉冲待核验':'本例 C0G、50 V、5%、1206；电路待验证']);
    rows.push(['Cboot',!custom&&p.bootNominal_nF===470&&p.bootTolerance_pct===10?'C2012X7R1H474K125AB':'料号待选',(p.bootNominal_nF??'未知')+' nF',custom?'自定义，耐压/有效容量待核验':'本例 X7R、50 V、10%、0805；有效容量待核实']);
    rows.push(['D1/D2',custom?'待选':'PMEG2010ER',custom?'按实际反压/脉冲/结电容另选':'20 V、1 A 级、SOD123W','推荐候选，尚未正式确认或验证']);
    rows.push(['Dz1/Dz3',p.zPositiveName||'待定',(p.zPositive_V??'未知')+' V','初选，参数与料号须自行核对']);
    rows.push(['Dz2',p.zNegativeHighName||'待定',(p.zNegativeHigh_V??'未知')+' V','仍为候选，不假定确认']);
    rows.push(['Dz4',p.zNegativeLowName||'待定',(p.zNegativeLow_V??'未知')+' V','初选，参数与料号须自行核对']);
    return rows;
  }
  return {fields,sources,notices,activeNotices,formulae,defaultProject,customProject,bom,version:'1.0.0'};
});
