
const menuBtn=document.querySelector(".menu-btn");
const navLinks=document.querySelector(".nav-links");
if(menuBtn) menuBtn.addEventListener("click",()=>navLinks.classList.toggle("show"));

document.querySelectorAll(".nav-links a").forEach(link=>{
  link.addEventListener("click",()=>navLinks.classList.remove("show"));
});

document.querySelectorAll(".faq-question").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const item=btn.parentElement;
    document.querySelectorAll(".faq-item").forEach(x=>{if(x!==item)x.classList.remove("open")});
    item.classList.toggle("open");
    btn.querySelector("span").textContent=item.classList.contains("open")?"−":"+";
  });
});

const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add("visible")});
},{threshold:.1});
document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));

const page=document.body.dataset.page;
document.querySelectorAll(".nav-links a").forEach(a=>{
  if(a.dataset.page===page)a.classList.add("active");
});

const year=document.querySelectorAll(".year");
year.forEach(el=>el.textContent=new Date().getFullYear());

const form=document.querySelector("#contactForm");
if(form){
  const API_BASE=(window.API_BASE||"").replace(/\/$/,"");
  const statusBox=document.querySelector("#formStatus");
  const submitBtn=form.querySelector('button[type="submit"]');
  const btnText=submitBtn.textContent;
  const setStatus=(type,text)=>{statusBox.className="form-status "+type;statusBox.textContent=text;};

  const errorText=async res=>{
    let detail;
    try{detail=(await res.json()).detail;}catch(_){}
    if(Array.isArray(detail)&&detail.length){
      const field=String(detail[0].loc?.slice(-1)[0]||"");
      const msg=String(detail[0].msg||"").replace(/^Value error,\s*/,"");
      return field?`Please check the ${field} field: ${msg}`:msg;
    }
    if(typeof detail==="string")return detail;
    return "Something went wrong. Please try again.";
  };

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    setStatus("","");
    submitBtn.disabled=true;
    submitBtn.textContent="Sending...";
    try{
      const res=await fetch(`${API_BASE}/api/contact`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      if(res.ok){
        const data=await res.json();
        form.reset();
        setStatus("success",data.message||"Thank you! Your message has been received.");
      }else{
        setStatus("error",await errorText(res));
      }
    }catch(_){
      setStatus("error","We couldn't reach the server. Please call 020 991 0589 or email prudenttechacademy@gmail.com.");
    }finally{
      submitBtn.disabled=false;
      submitBtn.textContent=btnText;
    }
  });
}
