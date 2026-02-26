window.addEventListener('DOMContentLoaded', () => {
  const panels=[...document.querySelectorAll('.panel')];
  const steps=[...document.querySelectorAll('.step')];
  const prevBtn=document.getElementById('prevBtn');
  const nextBtn=document.getElementById('nextBtn');
  const submitBtn=document.getElementById('submitBtn');
  const statusEl=document.getElementById('status');
  const form=document.getElementById('newHireForm');
  const toast=document.getElementById('toast');
  let current=0;

  function showPanel(i){
    panels.forEach((p,x)=>p.hidden=x!==i);
    steps.forEach((s,x)=>{s.classList.remove('active','done');if(x<i)s.classList.add('done');if(x===i)s.classList.add('active')});
    prevBtn.disabled=i===0;
    nextBtn.hidden=i===panels.length-1;
    submitBtn.hidden=i!==panels.length-1;
    statusEl.textContent='';
    statusEl.classList.remove('error');
  }

  function validatePanel(i){
    const panel=panels[i];
    const fields=panel.querySelectorAll('input,select,textarea');
    const radioGroups=new Map();
    fields.forEach(el=>{
      if(el.type==='radio'&&el.required){
        radioGroups.set(el.name,panel.querySelectorAll(`input[type="radio"][name="${el.name}"]`));
      }
    });
    for(const [name, group] of radioGroups){
      const any=[...group].some(r=>r.checked);
      if(!any) return `Please select an option for "${name}".`;
    }
    for(const el of fields){
      if(el.required&&el.type!=='radio'){
        if(!el.value||(el.tagName==='SELECT'&&!el.value)){
          const label=(panel.querySelector(`label[for="${el.name}"]`)?.textContent)
            || (el.closest('.control')?.querySelector('label')?.textContent)
            || el.name;
          return `Please complete required field: ${label.replace('*','').trim()}.`;
        }
      }
    }
    return '';
  }

  function next(){
    const msg=validatePanel(current);
    if(msg){ statusEl.textContent=msg; statusEl.classList.add('error'); return; }
    if(current<panels.length-1) showPanel(++current);
  }
  function prev(){ if(current>0) showPanel(--current); }

  showPanel(0);
  nextBtn.addEventListener('click',next);
  prevBtn.addEventListener('click',prev);

  const swOther=document.getElementById('swOther');
  if(swOther) swOther.addEventListener('change',e=>{
    const w=document.getElementById('otherSoftwareWrap');
    if(w) w.hidden=!e.target.checked;
  });

  document.querySelectorAll("input[name='isManager']").forEach(r=>{
    r.addEventListener('change',()=>{
      const isMgr=r.value==='Yes';
      const adobePro=[...document.querySelectorAll("input[name='software']")].find(x=>x.value==='Adobe Pro');
      const zoomPaid=[...document.querySelectorAll("input[name='software']")].find(x=>x.value==='Zoom Paid');
      if(isMgr){ if(adobePro) adobePro.checked=true; if(zoomPaid) zoomPaid.checked=true; }
    });
  });

  document.querySelectorAll("input[name='advancedConfig']").forEach(r=>{
    r.addEventListener('change',()=>{
      const adv=r.value==='Yes';
      const pro=[...document.querySelectorAll("input[name='equipment']")].find(x=>x.value==='Dell Pro Max Laptop');
      const wd=[...document.querySelectorAll("input[name='equipment']")].find(x=>x.value==='WD25 Dock');
      if(adv){ if(pro) pro.checked=true; if(wd) wd.checked=true; }
    });
  });

  function lines(arr){ return (arr&&arr.length) ? arr.join(', ') : 'None'; }
  function toastShow(){ if(!toast) return; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),3500); }

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const finalMsg=validatePanel(current);
    if(finalMsg){ statusEl.textContent=finalMsg; statusEl.classList.add('error'); return; }
    if(form.website && form.website.value){ return; }

    const data={
      fullName:form.fullName.value.trim(),
      personalEmail:form.personalEmail.value.trim(),
      startDate:form.startDate.value,
      jobTitle:form.jobTitle.value.trim(),
      department:form.department.value.trim(),
      manager:form.manager.value.trim(),
      office:form.office.value,
      isManager:(form.querySelector("input[name='isManager']:checked")||{}).value||'—',
      software:[...form.querySelectorAll("input[name='software']:checked")].map(x=>x.value),
      otherSoftware:form.otherSoftware?.value||'',
      advancedConfig:(form.querySelector("input[name='advancedConfig']:checked")||{}).value||'—',
      equipment:[...form.querySelectorAll("input[name='equipment']:checked")].map(x=>x.value),
      accessNotes:form.accessNotes.value,
      notes:form.notes.value
    };

    const ts=new Date().toLocaleString();
    const body=[
      `New Hire Request`,'',
      '— Contact —',
      `Full Name: ${data.fullName}`,
      `Personal Email: ${data.personalEmail}`,
      `Start Date: ${data.startDate}`,
      `Job Title: ${data.jobTitle}`,
      `Department: ${data.department||'—'}`,
      `Manager: ${data.manager||'—'}`,
      `Office: ${data.office}`,'',
      '— Role & Software —',
      `Is Manager: ${data.isManager}`,
      `Software: ${lines(data.software)}`,
      ...(data.otherSoftware ? [`Other Software Details: ${data.otherSoftware}`] : []),'',
      '— Equipment —',
      `Advanced Technical Config: ${data.advancedConfig}`,
      `Equipment: ${lines(data.equipment)}`,'',
      '— Notes —',
      `Systems / Access Notes: ${data.accessNotes||'—'}`,
      `Additional Notes: ${data.notes||'—'}`,'',
      `Submitted: ${ts}`
    ].join('\n');

    const to='tcrownover@concentra.com';
    const subject=`New Hire Request: ${data.fullName} — ${data.jobTitle||''} — Start ${data.startDate}`.replace(/\s+—\s+—/g,' —');
    const outlookWeb=`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const mailto=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    let opened=false;
    try { const w=window.open(outlookWeb,'_blank'); opened=!!w; } catch {}
    if(!opened){ window.location.href=mailto; }

    try { await navigator.clipboard.writeText(body); toastShow(); } catch {}
    form.reset(); showPanel(current=0);
  });
});