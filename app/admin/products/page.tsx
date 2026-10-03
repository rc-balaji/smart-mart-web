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
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <img
            className="h-12 w-12 rounded-xl object-cover"
            src="/smark-mart-icon.png"
            alt="Smark Mart"
          />
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Product Master
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Add, edit, stock, disable and delete products
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" href="/admin">
            Admin
          </a>
          <a className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800" href="/admin/products">
            Products
          </a>
          <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" href="/dispatch">
            Dispatch
          </a>
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Products', stats.total],
          ['Active', stats.active],
          ['Total Stock Qty', stats.stock],
          ['Low Stock', stats.low],
        ].map(([label, value]) => (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" key={label}>
            <b className="block text-2xl font-black text-slate-950">{value}</b>
            <span className="mt-1 block text-sm font-medium text-slate-500">{label}</span>
          </div>
        ))}
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Items</h2>
            <p className="mt-1 text-sm text-slate-500">
              Firestore product master used by the mobile scanner.
            </p>
          </div>
          <button
            className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800"
            onClick={() => setEditing({ ...blank })}
          >
            + Add Item
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && load()}
            placeholder="Search product, category, code..."
          />
          <button
            className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800"
            onClick={() => load()}
          >
            Search
          </button>
          <button
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={() => {
              setSearch('');
              load('');
            }}
          >
            Clear
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((product) => (
            <article
              className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              key={product.productId}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-xl">
                  {product.imageUrl ? (
                    <img className="h-full w-full object-cover" src={product.imageUrl} alt="" />
                  ) : (
                    '🛒'
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold text-slate-900">{product.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                    {product.productId} • {product.category || 'Uncategorized'} • {product.pack || 'No pack'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                    product.isActive === false
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {product.isActive === false ? 'INACTIVE' : 'ACTIVE'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Price</span>
                  <b className="mt-1 block truncate text-sm text-slate-900">{money(product.unitPrice)}</b>
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Scan</span>
                  <b className="mt-1 block truncate text-sm text-slate-900">{product.scanCode || '-'}</b>
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reorder</span>
                  <b className="mt-1 block truncate text-sm text-slate-900">{product.reorderLevel}</b>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-600">Stock Quantity</span>
                <div className="flex items-center gap-3">
                  <button
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                    disabled={busy || product.stockQty <= 0}
                    onClick={() => stock(product, -1)}
                    aria-label={`Decrease ${product.name} stock`}
                  >
                    −
                  </button>
                  <b className={`min-w-6 text-center ${product.stockQty <= product.reorderLevel ? 'text-red-700' : 'text-slate-900'}`}>
                    {product.stockQty}
                  </b>
                  <button
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => stock(product, 1)}
                    aria-label={`Increase ${product.name} stock`}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                <button
                  className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => edit(product)}
                >
                  Edit
                </button>
                <button
                  className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => toggle(product)}
                >
                  {product.isActive === false ? 'Activate' : 'Disable'}
                </button>
                <button
                  className="rounded-lg border border-red-200 px-2 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50"
                  onClick={() => remove(product)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        {!items.length && (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
            No products found.
          </div>
        )}
      </section>

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setEditing(null);
          }}
        >
          <form
            className="my-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7"
            onSubmit={save}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  {editing.productId ? 'Edit Product' : 'Add Product'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editing.productId || 'Product ID will be generated automatically'}
                </p>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-xl text-slate-500 transition hover:bg-slate-100"
                onClick={() => setEditing(null)}
                aria-label="Close product form"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Product Name
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Category
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Pack / Quantity
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" value={editing.pack} onChange={(event) => setEditing({ ...editing, pack: event.target.value })} placeholder="500 ml / 1 kg" />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Price ₹
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" type="number" min="0" step="0.01" required value={editing.unitPrice} onChange={(event) => setEditing({ ...editing, unitPrice: Number(event.target.value) })} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Stock Quantity
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" type="number" min="0" required value={editing.stockQty} onChange={(event) => setEditing({ ...editing, stockQty: Number(event.target.value) })} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Reorder Level
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" type="number" min="0" value={editing.reorderLevel} onChange={(event) => setEditing({ ...editing, reorderLevel: Number(event.target.value) })} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Barcode
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" value={editing.barcode} onChange={(event) => setEditing({ ...editing, barcode: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Scan Code
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" value={editing.scanCode} onChange={(event) => setEditing({ ...editing, scanCode: event.target.value.toUpperCase() })} placeholder="Auto for new product" />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
                Image URL
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" value={editing.imageUrl || ''} onChange={(event) => setEditing({ ...editing, imageUrl: event.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
                <input className="h-4 w-4 accent-teal-700" type="checkbox" checked={editing.isActive !== false} onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })} />
                Active and scannable
              </label>
            </div>
            <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={busy}
                type="submit"
              >
                {busy ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
