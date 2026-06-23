const STORAGE_KEY = "belvedere_crm_v2";
const legacy = JSON.parse(localStorage.getItem("belvedere_db") || "null");
const emptyDb = {clientes:[],transacoes:[],lotes:[],oportunidades:[],tarefas:[]};
const localSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || legacy;
let db = normalizeDb(emptyDb);
let salesChart, financeChart, dashboardPeriod = 30, drawerType = "";
let saveQueue = Promise.resolve();

const stageConfig = [
  {id:"lead",label:"Novos contatos",color:"#5f8fb5"},
  {id:"contato",label:"Em contato",color:"#d49c32"},
  {id:"proposta",label:"Proposta enviada",color:"#8a6bb7"},
  {id:"negociacao",label:"Negociação",color:"#d27652"},
  {id:"ganho",label:"Clientes ganhos",color:"#35a477"}
];
const titles = {dashboard:["CENTRAL DE OPERAÇÕES","Visão geral"],vendas:["COMERCIAL","Vendas"],crm:["RELACIONAMENTO","Funil CRM"],clientes:["RELACIONAMENTO","Clientes"],agenda:["PRODUTIVIDADE","Agenda comercial"],financeiro:["GESTÃO","Financeiro"],plantel:["PRODUÇÃO","Plantel"]};

function normalizeDb(data){
  const result={...emptyDb,...data};
  result.clientes=(result.clientes||[]).map(c=>({segmento:"Residencial",cidade:"",email:"",observacoes:"",...c}));
  result.transacoes=(result.transacoes||[]).map(t=>({responsavel:"-",produto:t.tipo==="venda"?"Ovos caipiras":t.desc||"-",...t}));
  result.oportunidades=result.oportunidades||[];
  result.tarefas=result.tarefas||[];
  return result;
}
function save(message){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
  renderAll();
  const snapshot = JSON.parse(JSON.stringify(db));
  saveQueue = saveQueue.then(async()=>{
    const response = await fetch("/api/data",{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(snapshot)
    });
    if(!response.ok)throw new Error("Falha ao salvar no Neon");
    db=normalizeDb(await response.json());
    localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
    renderAll();
    if(message)toast(message);
  }).catch(error=>{
    console.error(error);
    toast("Não foi possível sincronizar com o banco");
  });
  return saveQueue;
}
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const shortDate=d=>d?new Date(d+"T12:00:00").toLocaleDateString("pt-BR"):"—";
const isoToday=()=>new Date().toISOString().slice(0,10);
const initials=n=>(n||"?").split(" ").slice(0,2).map(x=>x[0]).join("").toUpperCase();
const clientName=id=>db.clientes.find(c=>String(c.id)===String(id))?.nome||"Cliente avulso";
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function inPeriod(date,days){const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);return new Date(date+"T12:00:00")>=start}
function sales(){return db.transacoes.filter(t=>t.tipo==="venda")}
function expenses(){return db.transacoes.filter(t=>t.tipo==="compra"||t.tipo==="invest")}

document.addEventListener("DOMContentLoaded",async()=>{
  document.querySelectorAll(".nav-link[data-view]").forEach(b=>b.onclick=()=>navigate(b.dataset.view));
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  document.addEventListener("click",e=>{const action=e.target.closest("[data-action]")?.dataset.action;if(action)openDrawer(action)});
  document.querySelectorAll(".period-filter button").forEach(b=>b.onclick=()=>{dashboardPeriod=+b.dataset.period;document.querySelectorAll(".period-filter button").forEach(x=>x.classList.toggle("active",x===b));renderDashboard()});
  ["salesSearch","salesStatusFilter","salesTypeFilter"].forEach(id=>document.getElementById(id).addEventListener("input",renderSales));
  ["clientSearch","clientSegmentFilter"].forEach(id=>document.getElementById(id).addEventListener("input",renderClients));
  document.getElementById("taskStatusFilter").onchange=renderAgenda;
  document.getElementById("closeDrawer").onclick=closeDrawer;document.getElementById("cancelDrawer").onclick=closeDrawer;document.getElementById("drawerBackdrop").onclick=closeDrawer;
  document.getElementById("drawerForm").onsubmit=submitDrawer;
  document.getElementById("menuButton").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("quickAdd").onclick=()=>openDrawer("sale");
  document.getElementById("backupButton").onclick=exportBackup;
  document.getElementById("importButton").onclick=()=>document.getElementById("importFile").click();
  document.getElementById("importFile").onchange=importBackup;
  document.getElementById("globalSearch").addEventListener("input",e=>{if(e.target.value){navigate("clientes");document.getElementById("clientSearch").value=e.target.value;renderClients()}});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDrawer();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();document.getElementById("globalSearch").focus()}});
  setInterval(()=>document.getElementById("clock").textContent=new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}),1000);
  await loadData();
  if(seedHelpfulData())await save();
  renderAll();
});

async function loadData(){
  try{
    const response=await fetch("/api/data");
    if(!response.ok)throw new Error("Falha ao carregar o Neon");
    const remote=normalizeDb(await response.json());
    const hasRemote=Object.values(remote).some(list=>Array.isArray(list)&&list.length);
    if(!hasRemote&&localSnapshot){
      db=normalizeDb(localSnapshot);
      await save("Dados locais migrados para o Neon");
    }else{
      db=remote;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
    }
  }catch(error){
    console.error(error);
    db=normalizeDb(localSnapshot||emptyDb);
    toast("Banco indisponível: usando dados locais");
  }
}

function seedHelpfulData(){
  let changed=false;
  if(!db.oportunidades.length&&db.clientes.length){
    db.oportunidades=db.clientes.slice(0,3).map((c,i)=>({id:Date.now()+i,clienteId:c.id,titulo:i?"Pedido recorrente":"Primeiro pedido",valor:[120,180,90][i]||100,etapa:["lead","contato","proposta"][i]||"lead",previsao:isoToday(),observacoes:""}));
    changed=true;
  }
  if(!db.tarefas.length&&db.clientes.length){
    const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
    db.tarefas=[{id:Date.now()+10,titulo:"Confirmar próximo pedido",clienteId:db.clientes[0].id,data:isoToday(),hora:"09:00",tipo:"Ligação",concluida:false},{id:Date.now()+11,titulo:"Enviar tabela de preços",clienteId:db.clientes[1]?.id||db.clientes[0].id,data:tomorrow.toISOString().slice(0,10),hora:"14:30",tipo:"WhatsApp",concluida:false}];
    changed=true;
  }
  return changed;
}
function navigate(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+view));
  document.querySelectorAll(".nav-link[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.getElementById("pageEyebrow").textContent=titles[view][0];document.getElementById("pageTitle").textContent=titles[view][1];
  document.getElementById("sidebar").classList.remove("open");
  ({dashboard:renderDashboard,vendas:renderSales,crm:renderPipeline,clientes:renderClients,agenda:renderAgenda,financeiro:renderFinance,plantel:renderFlock}[view])();
}
function renderAll(){
  const openTasks=db.tarefas.filter(t=>!t.concluida).length;
  document.getElementById("navTasks").textContent=openTasks;document.getElementById("navTasks").style.display=openTasks?"":"none";
  document.getElementById("notificationDot").style.display=openTasks?"":"none";
  document.getElementById("navOpportunities").textContent=db.oportunidades.filter(o=>o.etapa!=="ganho").length;
  renderDashboard();renderSales();renderPipeline();renderClients();renderAgenda();renderFinance();renderFlock();
}
function kpi(icon,label,value,sub,tone=""){return `<div class="kpi ${tone}"><div class="kpi-icon"><i class="${icon}"></i></div><div><span>${label}</span><strong>${value}</strong><small>${sub}</small></div></div>`}
function renderDashboard(){
  const periodSales=sales().filter(t=>inPeriod(t.data,dashboardPeriod)&&!t.cortesia);
  const revenue=periodSales.reduce((a,t)=>a+Number(t.valor),0), eggs=periodSales.reduce((a,t)=>a+Number(t.qtd),0);
  const pending=sales().filter(t=>!t.pago&&!t.cortesia).reduce((a,t)=>a+Number(t.valor),0);
  document.getElementById("kpiGrid").innerHTML=kpi("fa-solid fa-sack-dollar","Faturamento",money(revenue),`${periodSales.length} vendas no período`)+kpi("fa-solid fa-egg","Ovos vendidos",eggs.toLocaleString("pt-BR"),`${(eggs/12).toFixed(1)} dúzias`,"gold")+kpi("fa-solid fa-wallet","A receber",money(pending),"Vendas ainda pendentes","purple")+kpi("fa-solid fa-users","Clientes ativos",db.clientes.length,`${db.oportunidades.length} oportunidades no CRM`);
  const counts=Object.fromEntries(stageConfig.map(s=>[s.id,db.oportunidades.filter(o=>o.etapa===s.id).length]));const max=Math.max(1,...Object.values(counts));
  document.getElementById("funnelSummary").innerHTML=stageConfig.map(s=>`<div class="funnel-row"><label>${s.label}</label><div class="progress"><span style="width:${counts[s.id]/max*100}%;background:${s.color}"></span></div><strong>${counts[s.id]}</strong></div>`).join("");
  const recent=sales().sort((a,b)=>b.data.localeCompare(a.data)||b.id-a.id).slice(0,5);
  document.getElementById("recentSales").innerHTML=recent.length?recent.map(t=>`<div class="list-row"><div class="list-icon"><i class="fa-solid fa-egg"></i></div><div class="grow"><strong>${escapeHtml(clientName(t.clienteId))}</strong><span>${shortDate(t.data)} · ${t.qtd||0} ovos</span></div><span class="status ${t.pago?"paid":"pending"}">${t.pago?"Pago":"Pendente"}</span><strong>${money(t.valor)}</strong></div>`).join(""):empty("fa-receipt","Nenhuma venda cadastrada");
  const tasks=db.tarefas.filter(t=>!t.concluida).sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora)).slice(0,5);
  document.getElementById("dashboardTasks").innerHTML=tasks.length?tasks.map(t=>`<div class="list-row"><div class="list-icon"><i class="fa-regular fa-calendar"></i></div><div class="grow"><strong>${escapeHtml(t.titulo)}</strong><span>${escapeHtml(clientName(t.clienteId))}</span></div><strong>${shortDate(t.data)}<span>${t.hora||""}</span></strong></div>`).join(""):empty("fa-calendar-check","Agenda em dia");
  renderSalesChart(periodSales);
}
function renderSalesChart(list){
  if(typeof Chart==="undefined")return;const labels=[], values=[], orders=[];const buckets=dashboardPeriod<=7?7:dashboardPeriod<=30?10:12;
  for(let i=buckets-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i*(dashboardPeriod<=7?1:Math.ceil(dashboardPeriod/buckets)));labels.push(d.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}));const next=new Date(d);next.setDate(next.getDate()+(dashboardPeriod<=7?1:Math.ceil(dashboardPeriod/buckets)));const group=list.filter(t=>{const x=new Date(t.data+"T12:00:00");return x>=d&&x<next});values.push(group.reduce((a,t)=>a+Number(t.valor),0));orders.push(group.length)}
  salesChart?.destroy();salesChart=new Chart(document.getElementById("salesChart"),{type:"line",data:{labels,datasets:[{label:"Faturamento",data:values,borderColor:"#278260",backgroundColor:"rgba(53,164,119,.1)",fill:true,tension:.4,yAxisID:"y"},{label:"Pedidos",data:orders,borderColor:"#e4aa3b",tension:.4,yAxisID:"y1"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:9}}},y:{beginAtZero:true,grid:{color:"#edf0ee"},ticks:{font:{size:9}}},y1:{display:false,beginAtZero:true}}}});
}
function renderSales(){
  const q=document.getElementById("salesSearch").value.toLowerCase(),status=document.getElementById("salesStatusFilter").value,type=document.getElementById("salesTypeFilter").value;
  const list=sales().filter(t=>(!q||clientName(t.clienteId).toLowerCase().includes(q)||(t.produto||t.desc||"").toLowerCase().includes(q))&&(!status||(status==="pago")===!!t.pago)&&(!type||(type==="cortesia"&&t.cortesia)||(type==="venda"&&!t.cortesia))).sort((a,b)=>b.data.localeCompare(a.data));
  const total=list.filter(t=>!t.cortesia).reduce((a,t)=>a+Number(t.valor),0),pending=list.filter(t=>!t.pago&&!t.cortesia).reduce((a,t)=>a+Number(t.valor),0);
  document.getElementById("salesMiniStats").innerHTML=`<div class="mini-stat"><span>Total filtrado</span><strong>${money(total)}</strong></div><div class="mini-stat"><span>Pedidos</span><strong>${list.length}</strong></div><div class="mini-stat"><span>Pendente</span><strong>${money(pending)}</strong></div>`;
  document.getElementById("salesTable").innerHTML=list.length?list.map(t=>`<tr><td>${shortDate(t.data)}</td><td><div class="client-cell"><div class="table-avatar">${initials(clientName(t.clienteId))}</div><strong>${escapeHtml(clientName(t.clienteId))}</strong></div></td><td>${escapeHtml(t.produto||t.desc||"Ovos caipiras")}</td><td>${t.qtd||"—"}</td><td>${escapeHtml(t.responsavel||"—")}</td><td><button class="status ${t.pago?"paid":"pending"} table-action" onclick="togglePayment(${t.id})">${t.pago?"Pago":"Pendente"}</button></td><td><strong>${t.cortesia?"Cortesia":money(t.valor)}</strong></td><td><button class="table-action" onclick="removeItem('transacoes',${t.id})"><i class="fa-regular fa-trash-can"></i></button></td></tr>`).join(""):`<tr><td colspan="8">${empty("fa-receipt","Nenhuma venda encontrada")}</td></tr>`;
}
function renderPipeline(){
  document.getElementById("pipeline").innerHTML=stageConfig.map(stage=>{const items=db.oportunidades.filter(o=>o.etapa===stage.id),sum=items.reduce((a,o)=>a+Number(o.valor),0);return `<div class="pipeline-column" data-stage="${stage.id}"><div class="pipeline-head"><h3><i class="fa-solid fa-circle" style="color:${stage.color};font-size:7px"></i> ${stage.label}</h3><span>${items.length} · ${money(sum)}</span></div>${items.map(o=>`<div class="opportunity" draggable="true" data-id="${o.id}"><h4>${escapeHtml(o.titulo)}</h4><p>${escapeHtml(clientName(o.clienteId))}</p><div class="opportunity-foot"><strong>${money(o.valor)}</strong><span>${shortDate(o.previsao)}</span></div></div>`).join("")}</div>`}).join("");
  document.querySelectorAll(".opportunity").forEach(c=>{c.ondragstart=()=>c.classList.add("dragging");c.ondragend=()=>c.classList.remove("dragging")});
  document.querySelectorAll(".pipeline-column").forEach(col=>{col.ondragover=e=>e.preventDefault();col.ondrop=e=>{e.preventDefault();const card=document.querySelector(".opportunity.dragging");if(!card)return;const o=db.oportunidades.find(x=>x.id==card.dataset.id);o.etapa=col.dataset.stage;save("Oportunidade movida com sucesso")}})
}
function renderClients(){
  const q=document.getElementById("clientSearch").value.toLowerCase(),seg=document.getElementById("clientSegmentFilter").value;
  const list=db.clientes.filter(c=>(!q||[c.nome,c.contato,c.cidade].some(x=>(x||"").toLowerCase().includes(q)))&&(!seg||c.segmento===seg));
  document.getElementById("clientGrid").innerHTML=list.length?list.map(c=>{const tx=sales().filter(t=>String(t.clienteId)===String(c.id)),total=tx.filter(t=>!t.cortesia).reduce((a,t)=>a+Number(t.valor),0),last=tx.sort((a,b)=>b.data.localeCompare(a.data))[0];return `<article class="client-card" onclick="editClient(${c.id})"><div class="client-top"><div class="avatar">${initials(c.nome)}</div><div><h3>${escapeHtml(c.nome)}</h3><p>${escapeHtml(c.contato||"Sem telefone")} ${c.cidade?"· "+escapeHtml(c.cidade):""}</p></div><span class="segment">${escapeHtml(c.segmento)}</span></div><div class="client-metrics"><div><span>Compras</span><strong>${tx.length}</strong></div><div><span>Total</span><strong>${money(total)}</strong></div><div><span>Última compra</span><strong>${last?shortDate(last.data):"—"}</strong></div></div></article>`}).join(""):empty("fa-users","Nenhum cliente encontrado");
}
function renderAgenda(){
  const filter=document.getElementById("taskStatusFilter").value;let list=db.tarefas.filter(t=>filter==="todas"||(filter==="concluidas"?t.concluida:!t.concluida)).sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora));
  const groups=Object.groupBy?Object.groupBy(list,t=>t.data):list.reduce((a,t)=>((a[t.data]??=[]).push(t),a),{});
  document.getElementById("agendaDays").innerHTML=Object.keys(groups).length?Object.entries(groups).map(([date,tasks])=>`<div class="day-group"><h3>${date===isoToday()?"Hoje · ":""}${shortDate(date)}</h3>${tasks.map(t=>`<div class="task-card ${t.concluida?"done":""}"><button class="task-check" onclick="toggleTask(${t.id})">${t.concluida?'<i class="fa-solid fa-check" style="color:white;font-size:10px"></i>':""}</button><div class="task-info"><strong>${escapeHtml(t.titulo)}</strong><span>${escapeHtml(t.tipo)} · ${escapeHtml(clientName(t.clienteId))}</span></div><span class="task-time">${t.hora||"Sem horário"}</span><button class="table-action" onclick="removeItem('tarefas',${t.id})"><i class="fa-regular fa-trash-can"></i></button></div>`).join("")}</div>`).join(""):empty("fa-calendar-check","Nenhuma tarefa nesta seleção");
  const overdue=db.tarefas.filter(t=>!t.concluida&&t.data<isoToday()).length,today=db.tarefas.filter(t=>!t.concluida&&t.data===isoToday()).length,done=db.tarefas.filter(t=>t.concluida).length;
  document.getElementById("agendaSummary").innerHTML=`<div class="list-row"><div class="list-icon"><i class="fa-solid fa-calendar-day"></i></div><div class="grow"><strong>Para hoje</strong><span>Compromissos pendentes</span></div><strong>${today}</strong></div><div class="list-row"><div class="list-icon" style="background:#fbe9e7;color:#d85b55"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="grow"><strong>Atrasadas</strong><span>Precisam de atenção</span></div><strong>${overdue}</strong></div><div class="list-row"><div class="list-icon"><i class="fa-solid fa-check"></i></div><div class="grow"><strong>Concluídas</strong><span>Histórico total</span></div><strong>${done}</strong></div>`;
}
function renderFinance(){
  const gross=sales().filter(t=>!t.cortesia).reduce((a,t)=>a+Number(t.valor),0),received=sales().filter(t=>t.pago&&!t.cortesia).reduce((a,t)=>a+Number(t.valor),0),out=expenses().filter(t=>t.pago).reduce((a,t)=>a+Number(t.valor),0),pending=gross-received;
  document.getElementById("financeKpis").innerHTML=kpi("fa-solid fa-arrow-trend-up","Faturamento bruto",money(gross),"Todas as vendas")+kpi("fa-solid fa-circle-check","Total recebido",money(received),"Vendas pagas")+kpi("fa-solid fa-clock","A receber",money(pending),"Valores pendentes","gold")+kpi("fa-solid fa-arrow-trend-down","Despesas pagas",money(out),`Saldo: ${money(received-out)}`,"red");
  const list=expenses().sort((a,b)=>b.data.localeCompare(a.data)).slice(0,7);document.getElementById("expenseList").innerHTML=list.length?list.map(t=>`<div class="list-row"><div class="list-icon" style="background:#fbe9e7;color:#d85b55"><i class="fa-solid fa-arrow-down"></i></div><div class="grow"><strong>${escapeHtml(t.desc||t.produto)}</strong><span>${shortDate(t.data)} · ${escapeHtml(t.responsavel||"—")}</span></div><strong>${money(t.valor)}</strong></div>`).join(""):empty("fa-wallet","Nenhuma despesa");
  if(typeof Chart!=="undefined"){const months=Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-5+i);return d}),labels=months.map(d=>d.toLocaleDateString("pt-BR",{month:"short"}));const sum=(list,m)=>list.filter(t=>{const d=new Date(t.data+"T12:00:00");return d.getMonth()===m.getMonth()&&d.getFullYear()===m.getFullYear()}).reduce((a,t)=>a+Number(t.valor),0);financeChart?.destroy();financeChart=new Chart(document.getElementById("financeChart"),{type:"bar",data:{labels,datasets:[{label:"Entradas",data:months.map(m=>sum(sales().filter(t=>t.pago&&!t.cortesia),m)),backgroundColor:"#35a477",borderRadius:6},{label:"Saídas",data:months.map(m=>sum(expenses().filter(t=>t.pago),m)),backgroundColor:"#e4aa3b",borderRadius:6}]},options:{maintainAspectRatio:false,plugins:{legend:{position:"bottom"}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"#edf0ee"}}}}})}
}
function renderFlock(){
  const total=db.lotes.reduce((a,l)=>a+Number(l.qtd),0);document.getElementById("flockSummary").innerHTML=`<span>TOTAL DO PLANTEL</span><strong>${total.toLocaleString("pt-BR")} aves</strong>`;
  document.getElementById("flockGrid").innerHTML=db.lotes.length?db.lotes.map(l=>{const weeks=Math.max(0,Math.floor((new Date()-new Date(l.data+"T12:00:00"))/604800000));return `<article class="client-card"><div class="client-top"><div class="avatar"><i class="fa-solid fa-kiwi-bird"></i></div><div><h3>${escapeHtml(l.nome)}</h3><p>Entrada em ${shortDate(l.data)}</p></div><button class="table-action" onclick="removeItem('lotes',${l.id})"><i class="fa-regular fa-trash-can"></i></button></div><div class="client-metrics"><div><span>Aves</span><strong>${l.qtd}</strong></div><div><span>Idade</span><strong>${weeks} semanas</strong></div><div><span>Status</span><strong>Ativo</strong></div></div></article>`}).join(""):empty("fa-kiwi-bird","Nenhum lote cadastrado");
}
function empty(icon,text){return `<div class="empty"><i class="fa-solid ${icon}"></i>${text}</div>`}

function openDrawer(type,data={}){
  drawerType=type;const config={
    sale:["NOVA VENDA","Registrar venda",saleFields(data)],
    client:[data.id?"EDITAR CLIENTE":"NOVO CLIENTE",data.id?"Atualizar cadastro":"Cadastrar cliente",clientFields(data)],
    opportunity:["NOVA OPORTUNIDADE","Criar oportunidade",opportunityFields(data)],
    task:["NOVA TAREFA","Agendar acompanhamento",taskFields(data)],
    expense:["NOVA DESPESA","Registrar despesa",expenseFields(data)],
    flock:["NOVO LOTE","Cadastrar lote",flockFields(data)]
  }[type];
  document.getElementById("drawerKicker").textContent=config[0];document.getElementById("drawerTitle").textContent=config[1];document.getElementById("formFields").innerHTML=config[2];
  document.getElementById("drawer").classList.add("open");document.getElementById("drawerBackdrop").classList.add("open");
}
function closeDrawer(){document.getElementById("drawer").classList.remove("open");document.getElementById("drawerBackdrop").classList.remove("open");document.getElementById("drawerForm").reset()}
const clientOptions=(selected="")=>`<option value="">Cliente avulso</option>${db.clientes.map(c=>`<option value="${c.id}" ${String(c.id)===String(selected)?"selected":""}>${escapeHtml(c.nome)}</option>`).join("")}`;
const field=(label,name,type="text",value="",extra="",full="")=>`<div class="field ${full}"><label>${label}</label><input type="${type}" name="${name}" value="${escapeHtml(value)}" ${extra}></div>`;
function saleFields(d){return `<div class="form-grid">${field("Data","data","date",d.data||isoToday(),"required")}<div class="field"><label>Cliente</label><select name="clienteId">${clientOptions(d.clienteId)}</select></div>${field("Produto","produto","text",d.produto||"Ovos caipiras","required")}${field("Quantidade de ovos","qtd","number",d.qtd||"","min='0' required")}${field("Valor total","valor","number",d.valor||"","min='0' step='0.01' required")}${field("Responsável pela venda","responsavel","text",d.responsavel||"")}<div class="field"><label>Forma de pagamento</label><select name="formaPagamento"><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Prazo</option></select></div><div class="field full"><label class="checkbox-field"><input type="checkbox" name="pago" checked> Pagamento já recebido</label><label class="checkbox-field"><input type="checkbox" name="cortesia"> Registrar como cortesia</label></div></div>`}
function clientFields(d){return `<input type="hidden" name="id" value="${d.id||""}"><div class="form-grid">${field("Nome / razão social","nome","text",d.nome||"","required","full")}${field("Telefone / WhatsApp","contato","tel",d.contato||"")}${field("E-mail","email","email",d.email||"")}${field("Cidade","cidade","text",d.cidade||"")}<div class="field"><label>Segmento</label><select name="segmento">${["Residencial","Comércio","Restaurante","Revenda"].map(x=>`<option ${d.segmento===x?"selected":""}>${x}</option>`)}</select></div><div class="field full"><label>Observações</label><textarea name="observacoes">${escapeHtml(d.observacoes||"")}</textarea></div></div>`}
function opportunityFields(d){return `<div class="form-grid"><div class="field full"><label>Cliente</label><select name="clienteId" required>${clientOptions(d.clienteId)}</select></div>${field("Título da oportunidade","titulo","text",d.titulo||"","required","full")}${field("Valor estimado","valor","number",d.valor||"","min='0' step='0.01' required")}${field("Previsão de fechamento","previsao","date",d.previsao||isoToday())}<div class="field full"><label>Etapa</label><select name="etapa">${stageConfig.map(s=>`<option value="${s.id}">${s.label}</option>`)}</select></div></div>`}
function taskFields(d){return `<div class="form-grid">${field("Tarefa","titulo","text",d.titulo||"","required","full")}<div class="field full"><label>Cliente</label><select name="clienteId">${clientOptions(d.clienteId)}</select></div>${field("Data","data","date",d.data||isoToday(),"required")}${field("Horário","hora","time",d.hora||"09:00")}<div class="field full"><label>Tipo de contato</label><select name="tipo"><option>Ligação</option><option>WhatsApp</option><option>Visita</option><option>E-mail</option><option>Entrega</option></select></div></div>`}
function expenseFields(d){return `<div class="form-grid">${field("Data","data","date",d.data||isoToday(),"required")}${field("Valor","valor","number",d.valor||"","min='0' step='0.01' required")}${field("Descrição","desc","text",d.desc||"","required","full")}${field("Fornecedor","fornecedor","text",d.fornecedor||"")}${field("Responsável","responsavel","text",d.responsavel||"")}<div class="field full"><label class="checkbox-field"><input type="checkbox" name="pago" checked> Despesa já paga</label></div></div>`}
function flockFields(d){return `<div class="form-grid">${field("Nome do lote","nome","text",d.nome||"","required","full")}${field("Quantidade de aves","qtd","number",d.qtd||"","min='1' required")}${field("Data de entrada / nascimento","data","date",d.data||isoToday(),"required")}</div>`}
function submitDrawer(e){
  e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const id=Date.now();
  if(drawerType==="sale")db.transacoes.push({id,tipo:"venda",data:f.data,clienteId:f.clienteId,qtd:Number(f.qtd),valor:Number(f.valor),produto:f.produto,desc:f.produto,responsavel:f.responsavel||"-",formaPagamento:f.formaPagamento,pago:!!e.target.pago.checked,cortesia:!!e.target.cortesia.checked,comissao:false});
  if(drawerType==="client"){const item={...f,id:f.id?Number(f.id):id};delete item.id;const existing=db.clientes.find(c=>c.id==f.id);if(existing)Object.assign(existing,item);else db.clientes.push({id,...item})}
  if(drawerType==="opportunity")db.oportunidades.push({id,...f,valor:Number(f.valor)});
  if(drawerType==="task")db.tarefas.push({id,...f,concluida:false});
  if(drawerType==="expense")db.transacoes.push({id,tipo:"compra",data:f.data,clienteId:"",qtd:0,valor:Number(f.valor),desc:f.desc,produto:f.desc,responsavel:f.responsavel||f.fornecedor||"-",pago:!!e.target.pago.checked,cortesia:false,comissao:false});
  if(drawerType==="flock")db.lotes.push({id,nome:f.nome,qtd:Number(f.qtd),data:f.data});
  closeDrawer();save("Registro salvo com sucesso");
}
function editClient(id){openDrawer("client",db.clientes.find(c=>c.id==id))}
function togglePayment(id){const t=db.transacoes.find(x=>x.id==id);t.pago=!t.pago;save("Pagamento atualizado")}
function toggleTask(id){const t=db.tarefas.find(x=>x.id==id);t.concluida=!t.concluida;save("Tarefa atualizada")}
function removeItem(collection,id){if(confirm("Deseja realmente excluir este registro?")){db[collection]=db[collection].filter(x=>x.id!=id);save("Registro excluído")}}
function toast(message){const el=document.createElement("div");el.className="toast";el.innerHTML=`<i class="fa-solid fa-circle-check"></i>${escapeHtml(message)}`;document.getElementById("toastRegion").appendChild(el);setTimeout(()=>el.remove(),3000)}
function exportBackup(){const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`belvedere-backup-${isoToday()}.json`;a.click();URL.revokeObjectURL(a.href);toast("Backup gerado")}
function importBackup(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{db=normalizeDb(JSON.parse(reader.result));save("Dados restaurados com sucesso")}catch{alert("O arquivo selecionado não é um backup válido.")}};reader.readAsText(file);e.target.value=""}
