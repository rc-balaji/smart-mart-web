'use client';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';

type Product={id?:string;productId:string;category:string;name:string;pack:string;unitPrice:number;barcode:string;scanCode:string;qrUrl?:string;imageUrl?:string;stockQty:number;reorderLevel:number;isActive:boolean};
const blank:Product={productId:'',category:'',name:'',pack:'',unitPrice:0,barcode:'',scanCode:'',imageUrl:'',stockQty:100,reorderLevel:10,isActive:true};
const money=(n:any)=>`₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;

export default function Products(){
  const router=useRouter();
  const [items,setItems]=useState<Product[]>([]),[search,setSearch]=useState(''),[editing,setEditing]=useState<Product|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(q=search){const r=await fetch('/api/admin/products?q='+encodeURIComponent(q),{cache:'no-store'});if(r.status===401)return router.replace('/');const j=await r.json();if(j.ok)setItems(j.data);else setError(j.error||'Unable to load products')}
  useEffect(()=>{load('')},[]);
  const stats=useMemo(()=>({total:items.length,active:items.filter(x=>x.isActive!==false).length,low:items.filter(x=>Number(x.stockQty||0)<=Number(x.reorderLevel||0)).length,stock:items.reduce((a,x)=>a+Number(x.stockQty||0),0)}),[items]);
  async function act(action:string,payload:any){setBusy(true);setError('');try{const r=await fetch('/api/admin/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,payload})});if(r.status===401){router.replace('/');return}const j=await r.json();if(!j.ok)throw new Error(j.error||'Request failed');await load();return j.data}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  async function save(e:FormEvent){e.preventDefault();if(!editing)return;const action=editing.productId?'UPDATE_PRODUCT':'CREATE_PRODUCT';const result=await act(action,editing);if(result)setEditing(null)}
  async function remove(p:Product){if(!confirm(`Delete ${p.name}? Historical orders remain unchanged.`))return;await act('DELETE_PRODUCT',{productId:p.productId})}
  async function stock(p:Product,delta:number){await act('ADJUST_STOCK',{productId:p.productId,delta})}
  async function toggle(p:Product){await act('TOGGLE_PRODUCT',{productId:p.productId})}
  function edit(p:Product){setEditing({...blank,...p})}
  return <main className="shell">
    <header><div className="headerBrand"><img className="brandIcon" src="/smark-mart-icon.png" alt="Smark Mart"/><div><h1>Product Master</h1><p>Add, edit, stock, disable and delete products</p></div></div><nav><a href="/admin">Admin</a><a className="active" href="/admin/products">Products</a><a href="/dispatch">Dispatch</a></nav></header>
    <section className="stats"><div><b>{stats.total}</b><span>Products</span></div><div><b>{stats.active}</b><span>Active</span></div><div><b>{stats.stock}</b><span>Total Stock Qty</span></div><div><b>{stats.low}</b><span>Low Stock</span></div></section>
    {error&&<div className="error">{error}</div>}
    <section className="panel"><div className="panelHead"><div><h2>Items</h2><p>Firestore product master used by the mobile scanner.</p></div><button onClick={()=>setEditing({...blank})}>+ Add Item</button></div>
      <div className="productToolbar"><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()} placeholder="Search product, category, code..."/><button onClick={()=>load()}>Search</button><button className="secondaryBtn" onClick={()=>{setSearch('');load('')}}>Clear</button></div>
      <div className="productCards">{items.map(p=><article className="productCard" key={p.productId}>
        <div className="productTop"><div className="productAvatar">{p.imageUrl?<img src={p.imageUrl} alt=""/>:'🛒'}</div><div className="productIdentity"><h3>{p.name}</h3><p>{p.productId} • {p.category||'Uncategorized'} • {p.pack||'No pack'}</p></div><span className={`badge ${p.isActive===false?'OFF':'AVAILABLE'}`}>{p.isActive===false?'INACTIVE':'ACTIVE'}</span></div>
        <div className="productMeta"><div><span>Price</span><b>{money(p.unitPrice)}</b></div><div><span>Scan</span><b>{p.scanCode||'-'}</b></div><div><span>Reorder</span><b>{p.reorderLevel}</b></div></div>
        <div className="stockRow"><span>Stock Quantity</span><div><button disabled={busy||p.stockQty<=0} onClick={()=>stock(p,-1)}>−</button><b className={p.stockQty<=p.reorderLevel?'lowStock':''}>{p.stockQty}</b><button disabled={busy} onClick={()=>stock(p,1)}>+</button></div></div>
        <div className="productActions"><button className="secondaryBtn" onClick={()=>edit(p)}>Edit</button><button className="secondaryBtn" onClick={()=>toggle(p)}>{p.isActive===false?'Activate':'Disable'}</button><button className="dangerBtn" onClick={()=>remove(p)}>Delete</button></div>
      </article>)}</div>
      {!items.length&&<div className="emptyState">No products found.</div>}
    </section>
    {editing&&<div className="modalBack" onMouseDown={e=>{if(e.currentTarget===e.target)setEditing(null)}}><form className="productModal" onSubmit={save}><div className="modalTitle"><div><h2>{editing.productId?'Edit Product':'Add Product'}</h2><p>{editing.productId||'Product ID will be generated automatically'}</p></div><button type="button" className="closeBtn" onClick={()=>setEditing(null)}>×</button></div>
      <div className="formGrid"><label>Product Name<input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label><label>Category<input value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/></label><label>Pack / Quantity<input value={editing.pack} onChange={e=>setEditing({...editing,pack:e.target.value})} placeholder="500 ml / 1 kg"/></label><label>Price ₹<input type="number" min="0" step="0.01" required value={editing.unitPrice} onChange={e=>setEditing({...editing,unitPrice:Number(e.target.value)})}/></label><label>Stock Quantity<input type="number" min="0" required value={editing.stockQty} onChange={e=>setEditing({...editing,stockQty:Number(e.target.value)})}/></label><label>Reorder Level<input type="number" min="0" value={editing.reorderLevel} onChange={e=>setEditing({...editing,reorderLevel:Number(e.target.value)})}/></label><label>Barcode<input value={editing.barcode} onChange={e=>setEditing({...editing,barcode:e.target.value})}/></label><label>Scan Code<input value={editing.scanCode} onChange={e=>setEditing({...editing,scanCode:e.target.value.toUpperCase()})} placeholder="Auto for new product"/></label><label className="wide">Image URL<input value={editing.imageUrl||''} onChange={e=>setEditing({...editing,imageUrl:e.target.value})}/></label><label className="check wide"><input type="checkbox" checked={editing.isActive!==false} onChange={e=>setEditing({...editing,isActive:e.target.checked})}/> Active and scannable</label></div>
      <div className="modalActions"><button type="button" className="secondaryBtn" onClick={()=>setEditing(null)}>Cancel</button><button disabled={busy} type="submit">{busy?'Saving...':'Save Product'}</button></div>
    </form></div>}
  </main>
}
