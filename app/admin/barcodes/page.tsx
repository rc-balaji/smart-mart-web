'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Product = {
  productId?: string;
  id?: string;
  name?: string;
  category?: string;
  pack?: string;
  unitPrice?: number;
  stockQty?: number;
  isActive?: boolean;
  barcode?: string;
  scanCode?: string;
};

type Trolley = {
  trolleyId?: string;
  id?: string;
  qrPayload?: string;
  status?: string;
  currentSessionId?: string;
};

type BarcodeTarget = {
  label: string;
  value: string;
  details: string[];
};

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function productBarcode(product: Product) {
  return String(product.barcode || product.scanCode || product.productId || product.id || '').trim();
}

function trolleyBarcode(trolley: Trolley) {
  return String(trolley.qrPayload || trolley.trolleyId || trolley.id || '').trim();
}

export default function BarcodesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [trolleys, setTrolleys] = useState<Trolley[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<BarcodeTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [barcodeError, setBarcodeError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [productsResponse, dashboardResponse] = await Promise.all([
          fetch('/api/admin/products', { cache: 'no-store' }),
          fetch('/api/admin/dashboard', { cache: 'no-store' }),
        ]);

        if (productsResponse.status === 401 || dashboardResponse.status === 401) {
          router.replace('/');
          return;
        }

        const [productsJson, dashboardJson] = await Promise.all([
          productsResponse.json(),
          dashboardResponse.json(),
        ]);

        if (!productsJson.ok) {
          throw new Error(productsJson.error || 'Unable to load products.');
        }
        if (!dashboardJson.ok) {
          throw new Error(dashboardJson.error || 'Unable to load trolleys.');
        }

        const loadedProducts = productsJson.data as Product[];
        setProducts(loadedProducts);
        setTrolleys(dashboardJson.data.trolleys || []);

        const newProductId = new URLSearchParams(window.location.search).get('product');
        if (newProductId) {
          const product = loadedProducts.find((item) => item.productId === newProductId);
          if (product) {
            setSelected({
              label: product.name || product.productId || 'Product',
              value: productBarcode(product),
              details: [
                `Product ID: ${product.productId || product.id || '-'}`,
                `Category: ${product.category || 'Uncategorized'}`,
                `Pack: ${product.pack || 'Not specified'}`,
                `Price: ${money(Number(product.unitPrice || 0))}`,
              ],
            });
          }
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load barcode data.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      [product.productId, product.name, product.category, product.pack]
        .some((value) => String(value || '').toLowerCase().includes(query)),
    );
  }, [products, search]);

  const filteredTrolleys = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return trolleys;
    return trolleys.filter((trolley) =>
      [trolley.trolleyId, trolley.status, trolley.currentSessionId]
        .some((value) => String(value || '').toLowerCase().includes(query)),
    );
  }, [trolleys, search]);

  const barcodeUrl = selected
    ? `/api/admin/barcodes?value=${encodeURIComponent(selected.value)}`
    : '';

  async function downloadBarcode() {
    if (!selected) return;
    setDownloading(true);
    setBarcodeError('');

    try {
      const response = await fetch(barcodeUrl, { cache: 'no-store' });
      if (response.status === 401) {
        router.replace('/');
        return;
      }
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Unable to download barcode.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const safeName = selected.label.replace(/[^a-zA-Z0-9_-]/g, '_');
      anchor.href = objectUrl;
      anchor.download = `${safeName || 'barcode'}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError) {
      setBarcodeError(
        downloadError instanceof Error ? downloadError.message : 'Unable to download barcode.',
      );
    } finally {
      setDownloading(false);
    }
  }

  function openProductBarcode(product: Product) {
    setBarcodeError('');
    setSelected({
      label: product.name || product.productId || 'Product',
      value: productBarcode(product),
      details: [
        `Product ID: ${product.productId || product.id || '-'}`,
        `Category: ${product.category || 'Uncategorized'}`,
        `Pack: ${product.pack || 'Not specified'}`,
        `Price: ${money(Number(product.unitPrice || 0))}`,
      ],
    });
  }

  function openTrolleyBarcode(trolley: Trolley) {
    setBarcodeError('');
    setSelected({
      label: trolley.trolleyId || trolley.id || 'Trolley',
      value: trolleyBarcode(trolley),
      details: [
        `Trolley ID: ${trolley.trolleyId || trolley.id || '-'}`,
        `Status: ${trolley.status || 'Unknown'}`,
        `Active session: ${trolley.currentSessionId || 'None'}`,
      ],
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <img className="h-12 w-12 rounded-xl object-cover" src="/smark-mart-icon.png" alt="Smark Mart" />
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Barcode Master</h1>
            <p className="mt-1 text-sm text-slate-500">Product and trolley barcode details</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" href="/admin">Admin</a>
          <a className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950" href="/admin/products">Products</a>
          <a className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800" href="/admin/barcodes">Barcodes</a>
        </nav>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Barcode catalog</h2>
            <p className="mt-1 text-sm text-slate-500">
              Barcode values stay hidden here. Open an item to view or download its generated barcode.
            </p>
          </div>
          <input
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 sm:max-w-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, ID, category..."
            aria-label="Search barcode catalog"
          />
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading barcode details…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Products</h2>
                <p className="mt-1 text-sm text-slate-500">{filteredProducts.length} product(s)</p>
              </div>
              <a className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800" href="/admin/products">
                + Add Product
              </a>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const value = productBarcode(product);
                return (
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={product.productId || product.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-slate-900">{product.name || 'Unnamed product'}</h3>
                        <p className="mt-1 text-xs text-slate-500">{product.productId || product.id || 'No product ID'}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${product.isActive === false ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>
                        {product.isActive === false ? 'INACTIVE' : 'ACTIVE'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      {product.category || 'Uncategorized'}{product.pack ? ` • ${product.pack}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Price {money(Number(product.unitPrice || 0))} • Stock {Number(product.stockQty || 0)}</p>
                    <button
                      className="mt-4 w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-bold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      disabled={!value}
                      onClick={() => openProductBarcode(product)}
                    >
                      {value ? 'View Barcode' : 'Barcode unavailable'}
                    </button>
                  </article>
                );
              })}
            </div>
            {!filteredProducts.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No products found.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Trolleys</h2>
              <p className="mt-1 text-sm text-slate-500">{filteredTrolleys.length} trolley(s)</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredTrolleys.map((trolley) => {
                const value = trolleyBarcode(trolley);
                return (
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={trolley.trolleyId || trolley.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-slate-900">{trolley.trolleyId || trolley.id || 'Trolley'}</h3>
                        <p className="mt-1 text-xs text-slate-500">Current trolley</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-800">
                        {trolley.status || 'UNKNOWN'}
                      </span>
                    </div>
                    <p className="mt-3 truncate text-sm text-slate-600">
                      {trolley.currentSessionId || 'No active session'}
                    </p>
                    <button
                      className="mt-4 w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-bold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      disabled={!value}
                      onClick={() => openTrolleyBarcode(trolley)}
                    >
                      {value ? 'View Barcode' : 'Barcode unavailable'}
                    </button>
                  </article>
                );
              })}
            </div>
            {!filteredTrolleys.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No trolleys found.</p>}
          </section>
        </>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelected(null);
          }}
        >
          <section className="my-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="barcode-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="barcode-title" className="text-xl font-black text-slate-950">{selected.label}</h2>
                <p className="mt-1 text-sm text-slate-500">Barcode details</p>
              </div>
              <button
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-xl text-slate-500 transition hover:bg-slate-100"
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close barcode"
              >
                ×
              </button>
            </div>

            <dl className="mt-5 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm">
              {selected.details.map((detail) => (
                <div key={detail} className="text-slate-600">{detail}</div>
              ))}
              <div className="break-all font-mono text-xs text-slate-800">Barcode value: {selected.value}</div>
            </dl>

            <div className="mt-4 flex min-h-36 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-4">
              <img
                className="h-auto max-w-full"
                src={barcodeUrl}
                alt={`Barcode for ${selected.label}`}
                onError={() => setBarcodeError('Could not generate this barcode. Check that its value is supported.')}
              />
            </div>

            {barcodeError && <p className="mt-3 text-sm font-medium text-red-700" role="alert">{barcodeError}</p>}

            <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <button
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                type="button"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
              <button
                className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55"
                type="button"
                onClick={downloadBarcode}
                disabled={downloading || Boolean(barcodeError)}
              >
                {downloading ? 'Preparing…' : 'Download PNG'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
