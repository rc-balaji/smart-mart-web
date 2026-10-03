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

  order?: {
    orderId?: string;
    paymentStatus?: string;
    orderStatus?: string;
    total?: number;
  } | null;
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

  const [scannerOpen, setScannerOpen] =
    useState(false);

  const [scannerMessage, setScannerMessage] =
    useState(
      'Point the camera at the trolley QR or barcode.',
    );

  const [lastScanned, setLastScanned] =
    useState('');

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
  }

  async function openScanner() {
    setError('');
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
    } catch (cameraError: any) {
      scanningRef.current =
        false;

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
    orderStatus ===
    'DISPATCHED';

  const blocked =
    Boolean(data?.order) &&
    paymentStatus !== 'PAID';

  return (
    <main className="shell">
      <header>
        <div className="headerBrand">
          <img
            className="brandIcon"
            src="/smark-mart-icon.png"
            alt="Smark Mart"
          />

          <div>
            <h1>
              Smark Mart Dispatch
            </h1>

            <p>
              Scan • Validate •
              Dispatch • Return
            </p>
          </div>
        </div>

        <nav>
          <a href="/admin">
            Admin
          </a>

          <a href="/admin/products">
            Products
          </a>

          <a
            className="active"
            href="/dispatch"
          >
            Dispatch
          </a>
        </nav>
      </header>

      <section className="dispatchHero">
        <div className="dispatchHeroCopy">
          <span className="dispatchEyebrow">
            EXIT GATE
          </span>

          <h2>
            Scan trolley to validate
            checkout
          </h2>

          <p>
            The scanner checks payment
            and order status before the
            trolley can leave the store.
          </p>
        </div>

        <button
          className="scannerLaunch"
          onClick={openScanner}
          disabled={busy}
        >
          <span className="scannerLaunchIcon">
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

      <section className="dispatchCard dispatchControlCard">
        <div className="dispatchInputHeader">
          <div>
            <h3>
              Trolley Lookup
            </h3>

            <p>
              Scan using camera or enter
              the trolley code manually.
            </p>
          </div>

          {lastScanned && (
            <span className="lastScan">
              Last scan:
              {' '}
              {lastScanned}
            </span>
          )}
        </div>

        <div className="dispatchSearchRow">
          <input
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
            disabled={
              busy || !code.trim()
            }
            onClick={() =>
              callAction(
                'INSPECT',
              )
            }
          >
            {busy
              ? 'Checking…'
              : 'Check Status'}
          </button>
        </div>

        {error && (
          <div className="error">
            {error}
          </div>
        )}
      </section>

      {data && (
        <section className="dispatchResultPanel">
          <div className="dispatchResultTop">
            <div>
              <span className="resultLabel">
                TROLLEY
              </span>

              <h2>
                {trolleyId}
              </h2>
            </div>

            <span
              className={`dispatchStatusBadge ${trolleyStatus}`}
            >
              {trolleyStatus}
            </span>
          </div>

          <div className="dispatchStatusGrid">
            <article>
              <span>
                Order
              </span>

              <b>
                {data.order?.orderId ||
                  'No order'}
              </b>
            </article>

            <article>
              <span>
                Payment
              </span>

              <b>
                {paymentStatus}
              </b>
            </article>

            <article>
              <span>
                Order Status
              </span>

              <b>
                {orderStatus}
              </b>
            </article>

            <article>
              <span>
                Total
              </span>

              <b>
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

          {blocked && (
            <div className="dispatchBlock">
              <div className="dispatchBlockIcon">
                !
              </div>

              <div>
                <b>
                  DO NOT DISPATCH
                </b>

                <span>
                  Payment is still
                  pending.
                </span>
              </div>
            </div>
          )}

          {canDispatch && (
            <div className="dispatchReady">
              <div>
                <span>
                  ✓
                </span>

                <div>
                  <b>
                    Payment verified
                  </b>

                  <small>
                    This trolley is ready
                    for dispatch.
                  </small>
                </div>
              </div>

              <button
                disabled={busy}
                onClick={
                  dispatchOrder
                }
              >
                Confirm Dispatch
              </button>
            </div>
          )}

          {canReturn && (
            <div className="dispatchReturn">
              <div>
                <span>
                  ↩
                </span>

                <div>
                  <b>
                    Awaiting trolley
                    return
                  </b>

                  <small>
                    Confirm only after
                    the trolley is
                    physically returned.
                  </small>
                </div>
              </div>

              <button
                disabled={busy}
                onClick={
                  returnTrolley
                }
              >
                Confirm Return
              </button>
            </div>
          )}

          {trolleyStatus ===
            'AVAILABLE' && (
            <div className="dispatchAvailable">
              ✓ Trolley available for
              next customer
            </div>
          )}
        </section>
      )}

      {scannerOpen && (
        <div className="scannerModal">
          <div className="scannerShell">
            <div className="scannerTop">
              <div>
                <span>
                  LIVE SCANNER
                </span>

                <h3>
                  Scan trolley
                </h3>
              </div>

              <button
                onClick={
                  stopScanner
                }
                aria-label="Close scanner"
              >
                ×
              </button>
            </div>

            <div className="scannerViewport">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
              />

              <div className="scannerShade shadeTop" />
              <div className="scannerShade shadeBottom" />
              <div className="scannerShade shadeLeft" />
              <div className="scannerShade shadeRight" />

              <div className="scannerFrame">
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />

                <div className="scanLine" />
              </div>
            </div>

            <div className="scannerInfo">
              <div className="scannerPulse" />

              <span>
                {scannerMessage}
              </span>
            </div>

            <button
              className="scannerCancel"
              onClick={stopScanner}
            >
              Cancel Scanner
            </button>
          </div>
        </div>
      )}
    </main>
  );
}