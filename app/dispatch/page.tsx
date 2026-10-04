'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import {
  BrowserMultiFormatReader,
  IScannerControls,
} from '@zxing/browser';

type DispatchData = {
  trolley?: {
    trolleyId?: string;
    status?: string;
  };

  trolleyId?: string;

  items?: {
    cartItemId: string;
    productId?: string;
    name?: string;
    pack?: string;
    qty?: number;
    unitPrice?: number;
    lineTotal?: number;
  }[];

  order?: {
    orderId?: string;
    paymentStatus?: string;
    orderStatus?: string;
    total?: number;
  } | null;
};

type TrolleyStatus = {
  trolleyId: string;
  status: string;
};

export default function DispatchPage() {
  const router = useRouter();

  const [code, setCode] =
    useState('');

  const [data, setData] =
    useState<DispatchData | null>(
      null,
    );

  const [error, setError] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const [pendingAction, setPendingAction] =
    useState('');

  const [scannerOpen, setScannerOpen] =
    useState(false);

  const [cameraStarting, setCameraStarting] =
    useState(false);

  const [scannerMessage, setScannerMessage] =
    useState(
      'Point the camera at the trolley QR or barcode.',
    );

  const [lastScanned, setLastScanned] =
    useState('');

  const [checkedItemIds, setCheckedItemIds] =
    useState<string[]>([]);

  const [activeTab, setActiveTab] =
    useState<'dispatch' | 'trolleys'>('dispatch');

  const [trolleyStatuses, setTrolleyStatuses] =
    useState<TrolleyStatus[]>([]);

  const [trolleyError, setTrolleyError] =
    useState('');

  const [loadingTrolleys, setLoadingTrolleys] =
    useState(false);

  const [trolleyRefreshKey, setTrolleyRefreshKey] =
    useState(0);

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null,
    );

  const controlsRef =
    useRef<IScannerControls | null>(
      null,
    );

  const scanningRef =
    useRef(false);

  async function callAction(
    action: string,
    trolleyCode?: string,
    extraPayload: Record<string, unknown> = {},
  ) {
    const finalCode = (
      trolleyCode || code
    )
      .trim()
      .toUpperCase();

    if (!finalCode) {
      setError(
        'Scan or enter a trolley code.',
      );
      return null;
    }

    setBusy(true);
    setPendingAction(action);
    setError('');

    try {
      const response = await fetch(
        '/api/dispatch/action',
        {
          method: 'POST',
          headers: {
            'content-type':
              'application/json',
          },
          body: JSON.stringify({
            action,
            payload: {
              trolleyCode:
                finalCode,
              ...extraPayload,
            },
          }),
        },
      );

      if (
        response.status === 401
      ) {
        router.replace('/');
        return null;
      }

      const json =
        await response.json();

      if (!json.ok) {
        throw new Error(
          json.error ||
            'Dispatch request failed.',
        );
      }

      if (action === 'INSPECT') {
        setData(json.data);
        setCheckedItemIds([]);
      }

      return json.data;
    } catch (requestError: any) {
      setError(
        requestError?.message ||
          'Request failed.',
      );

      return null;
    } finally {
      setBusy(false);
      setPendingAction('');
    }
  }

  async function inspectCode(
    value: string,
  ) {
    const normalized = value
      .trim()
      .toUpperCase();

    if (!normalized) {
      return;
    }

    setCode(normalized);

    const result =
      await callAction(
        'INSPECT',
        normalized,
      );

    if (result) {
      setLastScanned(
        normalized,
      );
    }
  }

  async function dispatchOrder() {
    if (
      !confirm(
        'Payment verified. Confirm dispatch?',
      )
    ) {
      return;
    }

    const result =
      await callAction(
        'DISPATCH',
        undefined,
        { checkedItemIds },
      );

    if (result) {
      await callAction(
        'INSPECT',
      );
    }
  }

  async function returnTrolley() {
    if (
      !confirm(
        'Confirm trolley has physically returned?',
      )
    ) {
      return;
    }

    const result =
      await callAction(
        'RETURN',
      );

    if (result) {
      await callAction(
        'INSPECT',
      );
    }
  }

  function stopScanner() {
    scanningRef.current =
      false;

    if (
      controlsRef.current
    ) {
      controlsRef.current.stop();
      controlsRef.current =
        null;
    }

    if (
      videoRef.current?.srcObject
    ) {
      const stream =
        videoRef.current
          .srcObject as MediaStream;

      stream
        .getTracks()
        .forEach((track) =>
          track.stop(),
        );

      videoRef.current.srcObject =
        null;
    }

    setScannerOpen(false);
    setCameraStarting(false);
  }

  async function openScanner() {
    setError('');
    setCameraStarting(true);
    setScannerMessage(
      'Starting rear camera…',
    );

    setScannerOpen(true);

    await new Promise(
      (resolve) =>
        setTimeout(resolve, 150),
    );

    const video =
      videoRef.current;

    if (!video) {
      setScannerMessage(
        'Camera view unavailable.',
      );
      return;
    }

    try {
      const devices =
        await BrowserMultiFormatReader.listVideoInputDevices();

      if (!devices.length) {
        throw new Error(
          'No camera detected.',
        );
      }

      const preferred =
        devices.find((device) =>
          /back|rear|environment/i.test(
            device.label,
          ),
        ) || devices.at(-1);

      const reader =
        new BrowserMultiFormatReader(
          undefined,
          {
            delayBetweenScanAttempts:
              80,
            delayBetweenScanSuccess:
              1200,
          },
        );

      scanningRef.current =
        true;

      setScannerMessage(
        'Align the QR or barcode inside the frame.',
      );

      controlsRef.current =
        await reader.decodeFromVideoDevice(
          preferred?.deviceId,
          video,
          async (
            result,
            scanError,
            controls,
          ) => {
            if (
              !scanningRef.current
            ) {
              return;
            }

            if (result) {
              const value =
                result
                  .getText()
                  .trim();

              if (!value) {
                return;
              }

              scanningRef.current =
                false;

              if (
                navigator.vibrate
              ) {
                navigator.vibrate(
                  [90, 40, 90],
                );
              }

              setScannerMessage(
                `Scanned: ${value}`,
              );

              controls.stop();

              controlsRef.current =
                null;

              setScannerOpen(false);

              await inspectCode(
                value,
              );
            } else if (
              scanError
            ) {
              // Scanner continuously retries.
              // Do not surface ordinary decode misses.
            }
          },
        );
      setCameraStarting(false);
    } catch (cameraError: any) {
      scanningRef.current =
        false;
      setCameraStarting(false);

      setScannerMessage(
        cameraError?.message ||
          'Camera permission unavailable.',
      );
    }
  }

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'trolleys') {
      return;
    }

    async function loadTrolleyStatuses() {
      setLoadingTrolleys(true);
      setTrolleyError('');

      try {
        const response = await fetch('/api/dispatch/action', {
          cache: 'no-store',
        });

        if (response.status === 401) {
          router.replace('/');
          return;
        }

        const json = await response.json();
        if (!json.ok) {
          throw new Error(json.error || 'Unable to load trolley statuses.');
        }

        setTrolleyStatuses(json.data);
      } catch (loadError) {
        setTrolleyError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load trolley statuses.',
        );
      } finally {
        setLoadingTrolleys(false);
      }
    }

    loadTrolleyStatuses();
    const timer = window.setInterval(loadTrolleyStatuses, 8000);
    return () => window.clearInterval(timer);
  }, [activeTab, trolleyRefreshKey, router]);

  const trolleyId =
    data?.trolley?.trolleyId ||
    data?.trolleyId ||
    '-';

  const trolleyStatus =
    data?.trolley?.status ||
    '-';

  const paymentStatus =
    data?.order?.paymentStatus ||
    '-';

  const orderStatus =
    data?.order?.orderStatus ||
    '-';

  const canDispatch =
    paymentStatus === 'PAID' &&
    orderStatus ===
      'READY_FOR_DISPATCH';

  const canReturn =
    orderStatus === 'DISPATCHED' ||
    trolleyStatus === 'RETURN_PENDING';

  const blocked =
    Boolean(data?.order) &&
    paymentStatus !== 'PAID';

  const items =
    data?.items || [];

  const allItemsChecked =
    items.length > 0 &&
    items.every((item) =>
      checkedItemIds.includes(item.cartItemId),
    );

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
              Smark Mart Dispatch
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Scan • Validate •
              Dispatch • Return
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          <button
            className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
              activeTab === 'dispatch'
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
            type="button"
            onClick={() => setActiveTab('dispatch')}
          >
            Dispatch
          </button>
          <button
            className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
              activeTab === 'trolleys'
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
            type="button"
            onClick={() => setActiveTab('trolleys')}
          >
            Trolley
          </button>
        </nav>
      </header>

      {activeTab === 'dispatch' ? (
        <>
      <section className="mt-1 flex flex-col items-stretch justify-between gap-6 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-900 p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <span className="mb-2 inline-block text-[10px] font-black tracking-[0.2em] text-teal-300">
            EXIT GATE
          </span>

          <h2 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            Scan trolley to validate
            checkout
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
            The scanner checks payment
            and order status before the
            trolley can leave the store.
          </p>
        </div>

        <button
          className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5 text-left text-white shadow-sm backdrop-blur transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto sm:min-w-60"
          onClick={openScanner}
          disabled={busy}
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-teal-500 text-2xl">
            ▣
          </span>

          <span>
            <b>
              Open Camera Scanner
            </b>

            <small>
              QR + barcode
            </small>
          </span>
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div>
            <h3 className="font-bold text-slate-900">
              Trolley Lookup
            </h3>

            <p className="mt-1 text-xs text-slate-500">
              Scan using camera or enter
              the trolley code manually.
            </p>
          </div>

          {lastScanned && (
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
              Last scan:
              {' '}
              {lastScanned}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto]">
          <input
            className="w-full rounded-xl border border-slate-300 px-3.5 py-3.5 text-base uppercase outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
            placeholder="SM-TROLLEY-01"
            value={code}
            onChange={(event) =>
              setCode(
                event.target.value.toUpperCase(),
              )
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter'
              ) {
                callAction(
                  'INSPECT',
                );
              }
            }}
          />

          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 font-black text-white transition duration-200 hover:-translate-y-0.5 hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              busy || !code.trim()
            }
            onClick={() =>
              callAction(
                'INSPECT',
              )
            }
          >
            {pendingAction === 'INSPECT' && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
            )}
            {pendingAction === 'INSPECT'
              ? 'Checking trolley…'
              : 'Check Status'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
            {error}
          </div>
        )}
      </section>

      {data && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-black tracking-[0.16em] text-slate-500">
                TROLLEY
              </span>

              <h2 className="mt-1 break-all text-xl font-black text-slate-950">
                {trolleyId}
              </h2>
            </div>

            <span
              className={`max-w-full whitespace-normal break-words rounded-full px-3 py-2 text-center text-[11px] font-black sm:max-w-[45%] ${
                trolleyStatus === 'AVAILABLE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : trolleyStatus === 'IN_USE'
                    ? 'bg-blue-100 text-blue-800'
                    : trolleyStatus === 'PAYMENT_PENDING'
                      ? 'bg-orange-100 text-orange-800'
                      : trolleyStatus === 'PAID'
                        ? 'bg-violet-100 text-violet-800'
                        : trolleyStatus === 'RETURN_PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : trolleyStatus === 'DAMAGED'
                            ? 'bg-red-100 text-red-800'
                            : trolleyStatus === 'MAINTENANCE'
                              ? 'bg-orange-100 text-orange-900'
                          : 'bg-slate-100 text-slate-700'
              }`}
            >
              {trolleyStatus}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <article className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                Order
              </span>

              <b className="mt-1.5 block truncate text-sm text-slate-900">
                {data.order?.orderId ||
                  'No order'}
              </b>
            </article>

            <article className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                Payment
              </span>

              <b className="mt-1.5 block truncate text-sm text-slate-900">
                {paymentStatus}
              </b>
            </article>

            <article className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                Order Status
              </span>

              <b className="mt-1.5 block truncate text-sm text-slate-900">
                {orderStatus}
              </b>
            </article>

            <article className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <span className="block text-[10px] font-extrabold uppercase text-slate-500">
                Total
              </span>

              <b className="mt-1.5 block truncate text-sm text-slate-900">
                {data.order?.total !=
                null
                  ? `₹${Number(
                      data.order
                        .total,
                    ).toLocaleString(
                      'en-IN',
                    )}`
                  : '-'}
              </b>
            </article>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900">
                  Trolley bill items
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Check each item against the trolley before dispatch.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                {checkedItemIds.length}/{items.length} checked
              </span>
            </div>

            {items.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {items.map((item) => {
                  const checked = checkedItemIds.includes(item.cartItemId);
                  return (
                    <li
                      className="flex items-center gap-3 py-3"
                      key={item.cartItemId}
                    >
                      <input
                        className="h-5 w-5 shrink-0 accent-teal-700"
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setCheckedItemIds((current) =>
                            event.target.checked
                              ? [...current, item.cartItemId]
                              : current.filter((id) => id !== item.cartItemId),
                          )
                        }
                        aria-label={`Verify ${item.name || item.productId || 'item'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-sm text-slate-900">
                          {item.name || item.productId || 'Product'}
                        </b>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {item.productId || 'No product ID'}
                          {item.pack ? ` • ${item.pack}` : ''}
                        </span>
                      </div>
                      <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-black text-slate-800">
                        × {Number(item.qty || 0)}
                      </span>
                      <b className="w-20 shrink-0 text-right text-sm text-slate-900">
                        ₹{Number(item.lineTotal || 0).toLocaleString('en-IN')}
                      </b>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
                No active bill items for this trolley.
              </p>
            )}
          </div>

          {blocked && (
            <div className="mt-3.5 flex items-center gap-3 rounded-2xl bg-red-50 p-3.5 text-red-800">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-600 text-xl font-black text-white">
                !
              </div>

              <div>
                <b className="block font-black">
                  DO NOT DISPATCH
                </b>

                <span className="mt-0.5 block text-xs">
                  Payment is still
                  pending.
                </span>
              </div>
            </div>
          )}

          {canDispatch && (
            <div className="mt-3.5 flex flex-col items-stretch justify-between gap-4 rounded-2xl bg-emerald-50 p-3.5 text-emerald-900 sm:flex-row sm:items-center">
              <div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-black">
                  ✓
                </span>

                <div>
                  <b className="block font-bold">
                    Payment verified
                  </b>

                  <small className="mt-1 block">
                    This trolley is ready
                    for dispatch.
                  </small>
                </div>
              </div>

              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-black text-white transition duration-200 hover:-translate-y-0.5 hover:bg-green-700 disabled:opacity-55"
                disabled={busy || !allItemsChecked}
                onClick={
                  dispatchOrder
                }
              >
                {pendingAction === 'DISPATCH' && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                )}
                {pendingAction === 'DISPATCH' ? 'Dispatching…' : 'Confirm Dispatch'}
              </button>
            </div>
          )}

          {canReturn && (
            <div className="mt-3.5 flex flex-col items-stretch justify-between gap-4 rounded-2xl bg-orange-50 p-3.5 text-orange-900 sm:flex-row sm:items-center">
              <div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-black">
                  ↩
                </span>

                <div>
                  <b className="block font-bold">
                    Awaiting trolley
                    return
                  </b>

                  <small className="mt-1 block">
                    {orderStatus === 'DISPATCHED'
                      ? 'Confirm only after the trolley is physically returned.'
                      : 'Customer requested a trolley return. Inspect the trolley, then confirm its return.'}
                  </small>
                </div>
              </div>

              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 font-black text-white transition duration-200 hover:-translate-y-0.5 hover:bg-amber-700 disabled:opacity-55"
                disabled={busy}
                onClick={
                  returnTrolley
                }
              >
                {pendingAction === 'RETURN' && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                )}
                {pendingAction === 'RETURN' ? 'Updating trolley…' : 'Confirm Return'}
              </button>
            </div>
          )}

          {trolleyStatus ===
            'AVAILABLE' && (
            <div className="mt-3.5 rounded-xl bg-green-50 p-3 text-center font-black text-green-800">
              ✓ Trolley available for
              next customer
            </div>
          )}
        </section>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/90 p-5 backdrop-blur-xl max-sm:p-0">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-white shadow-2xl shadow-black/60 max-sm:flex max-sm:h-dvh max-sm:max-w-none max-sm:flex-col max-sm:rounded-none">
            <div className="flex items-center justify-between p-4.5">
              <div>
                <span className="block text-[9px] font-black tracking-[0.18em] text-teal-300">
                  LIVE SCANNER
                </span>

                <h3 className="mt-1 text-lg font-bold">
                  Scan trolley
                </h3>
              </div>

              <button
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-2xl text-white transition hover:bg-white/15"
                onClick={
                  stopScanner
                }
                aria-label="Close scanner"
              >
                ×
              </button>
            </div>

            <div className="relative aspect-[4/5] overflow-hidden bg-black max-sm:min-h-0 max-sm:flex-1 max-sm:aspect-auto">
              <video
                className="h-full w-full object-cover"
                ref={videoRef}
                autoPlay
                muted
                playsInline
              />

              {cameraStarting && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-950/75 p-8 backdrop-blur-sm" role="status">
                  <div className="skeleton-shimmer h-24 w-full max-w-xs rounded-2xl opacity-40" />
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-teal-300/30 border-t-teal-300" aria-hidden="true" />
                  <span className="text-sm font-semibold text-white">Preparing camera…</span>
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-0 top-0 h-[28%] bg-slate-950/55" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[28%] bg-slate-950/55" />
              <div className="pointer-events-none absolute bottom-[28%] left-0 top-[28%] w-[12%] bg-slate-950/55" />
              <div className="pointer-events-none absolute bottom-[28%] right-0 top-[28%] w-[12%] bg-slate-950/55" />

              <div className="absolute bottom-[28%] left-[12%] right-[12%] top-[28%] overflow-hidden">
                <i className="absolute left-0 top-0 h-[35px] w-[35px] rounded-tl-xl border-l-4 border-t-4 border-solid border-teal-400" />
                <i className="absolute right-0 top-0 h-[35px] w-[35px] rounded-tr-xl border-r-4 border-t-4 border-solid border-teal-400" />
                <i className="absolute bottom-0 left-0 h-[35px] w-[35px] rounded-bl-xl border-b-4 border-l-4 border-solid border-teal-400" />
                <i className="absolute bottom-0 right-0 h-[35px] w-[35px] rounded-br-xl border-b-4 border-r-4 border-solid border-teal-400" />

                <div className="absolute left-2 right-2 h-0.5 animate-scanner-sweep bg-gradient-to-r from-transparent via-teal-300 to-transparent shadow-[0_0_18px_#2dd4bf]" />
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-4.5 py-3.5 text-xs text-slate-300">
              <div className="h-2 w-2 shrink-0 animate-scanner-pulse rounded-full bg-teal-400" />

              <span>
                {scannerMessage}
              </span>
            </div>

            <button
              className="mx-4.5 mb-4.5 rounded-xl bg-slate-900 px-3.5 py-3 font-black text-white transition hover:bg-slate-800"
              onClick={stopScanner}
            >
              Cancel Scanner
            </button>
          </div>
        </div>
      )}
        </>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Trolley status</h2>
              <p className="mt-1 text-sm text-slate-500">Live status refreshes automatically.</p>
            </div>
            <button
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              type="button"
              disabled={loadingTrolleys}
              onClick={() => setTrolleyRefreshKey((key) => key + 1)}
            >
              {loadingTrolleys ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {trolleyError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
              {trolleyError}
            </div>
          )}

          {loadingTrolleys && !trolleyStatuses.length ? (
            <ul className="divide-y divide-slate-100" role="status" aria-label="Loading trolley statuses">
              {[0, 1, 2, 3].map((item) => (
                <li className="flex items-center justify-between gap-4 py-4" key={item}>
                  <span className="skeleton-shimmer h-4 w-40 rounded" />
                  <span className="skeleton-shimmer h-7 w-28 rounded-full" />
                </li>
              ))}
            </ul>
          ) : trolleyStatuses.length ? (
            <ul className="divide-y divide-slate-100">
              {trolleyStatuses.map((trolley) => (
                <li className="flex items-center justify-between gap-4 py-3" key={trolley.trolleyId}>
                  <b className="truncate text-sm text-slate-900">{trolley.trolleyId}</b>
                  <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${
                    trolley.status === 'AVAILABLE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : trolley.status === 'IN_USE'
                        ? 'bg-blue-100 text-blue-800'
                        : trolley.status === 'PAYMENT_PENDING'
                          ? 'bg-orange-100 text-orange-800'
                          : trolley.status === 'PAID'
                            ? 'bg-violet-100 text-violet-800'
                            : trolley.status === 'RETURN_PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : trolley.status === 'DAMAGED'
                                ? 'bg-red-100 text-red-800'
                                : trolley.status === 'MAINTENANCE'
                                  ? 'bg-orange-100 text-orange-900'
                              : 'bg-slate-100 text-slate-700'
                  }`}>
                    {trolley.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No trolleys found.</p>
          )}
        </section>
      )}
    </main>
  );
}