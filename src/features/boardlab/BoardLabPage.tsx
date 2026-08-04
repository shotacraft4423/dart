import { useRef, useState } from 'react';
import { DartBoard } from '../../components/DartBoard';
import { resolveHit } from '../../lib/dartboardGeometry';
import {
  connectAndSubscribe,
  disconnectBoard,
  formatBytes,
  parseUuidList,
  type ConnectedBoard,
  type RawNotification,
} from '../../lib/bleInspector';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

const BLUETOOTH_AVAILABLE = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export function BoardLabPage() {
  const [serviceUuidInput, setServiceUuidInput] = useState('');
  const [state, setState] = useState<ConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [log, setLog] = useState<RawNotification[]>([]);

  const boardRef = useRef<ConnectedBoard | null>(null);
  const captureStartRef = useRef(0);
  const logIdRef = useRef(0);

  async function handleConnect() {
    const uuids = parseUuidList(serviceUuidInput);
    if (uuids.length === 0) {
      setErrorMessage('サービスUUIDを最低1つ入力してください(nRF Connect等で確認したもの)。');
      setState('error');
      return;
    }
    setState('connecting');
    setErrorMessage('');
    try {
      captureStartRef.current = performance.now();
      const board = await connectAndSubscribe(uuids, (serviceUuid, characteristicUuid, value) => {
        const { hex, decimal } = formatBytes(value);
        logIdRef.current += 1;
        const entry: RawNotification = {
          id: String(logIdRef.current),
          atMs: performance.now() - captureStartRef.current,
          serviceUuid,
          characteristicUuid,
          bytesHex: hex,
          bytesDecimal: decimal,
          label: null,
        };
        setLog((prev) => [entry, ...prev]);
      });
      boardRef.current = board;
      setDeviceName(board.device.name || '(名前なし)');
      setState('connected');
      if (board.subscribedCharacteristics.length === 0) {
        setErrorMessage(
          '接続はできましたが、通知(notify/indicate)対応のキャラクタリスティックが見つかりませんでした。UUIDが正しいか、機器が信号送信状態か確認してください。',
        );
      }
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDisconnect() {
    if (boardRef.current) {
      await disconnectBoard(boardRef.current);
      boardRef.current = null;
    }
    setState('idle');
    setDeviceName('');
  }

  function handleLabelClick(hit: ReturnType<typeof resolveHit>) {
    setLog((prev) => {
      const idx = prev.findIndex((e) => e.label === null);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], label: { segment: hit.segment, multiplier: hit.multiplier, score: hit.score } };
      return next;
    });
  }

  function handleClearLog() {
    setLog([]);
    logIdRef.current = 0;
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify({ deviceName, capturedAt: new Date().toISOString(), log }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `board-signal-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const unlabeledCount = log.filter((e) => e.label === null).length;

  return (
    <div className="page">
      <h2>ボード信号解析ラボ</h2>
      <p className="page-lead">
        実機ダーツボードのBLE通信を記録し、投げたセグメントとの対応関係をラベル付けして蓄積するための調査ツールです。Web
        Bluetoothはページが事前に知っているサービスUUIDにしかアクセスできない仕様のため、まず「nRF Connect」等のアプリで実機をスキャンし、
        表示されたサービスUUID(128bitの文字列)を下の欄に入力してください。
      </p>

      {!BLUETOOTH_AVAILABLE && (
        <p className="camera-warning">
          このブラウザはWeb Bluetoothに対応していません。Chrome/EdgeでHTTPS環境から開いてください。
        </p>
      )}

      <section className="card">
        <h3>接続</h3>
        <div className="rating-form">
          <label style={{ flex: '1 1 320px' }}>
            サービスUUID(カンマ区切りで複数可)
            <input
              type="text"
              placeholder="例: 0000fff0-0000-1000-8000-00805f9b34fb"
              value={serviceUuidInput}
              onChange={(e) => setServiceUuidInput(e.target.value)}
              disabled={state === 'connected'}
            />
          </label>
          {state !== 'connected' ? (
            <button className="btn-primary" onClick={handleConnect} disabled={!BLUETOOTH_AVAILABLE || state === 'connecting'}>
              {state === 'connecting' ? '接続中...' : 'デバイスを検索して接続'}
            </button>
          ) : (
            <button className="btn-secondary" onClick={handleDisconnect}>
              切断
            </button>
          )}
        </div>
        {state === 'connected' && <p className="camera-status">接続中: {deviceName}</p>}
        {errorMessage && <p className="camera-warning">{errorMessage}</p>}
      </section>

      <div className="camera-body">
        <div className="skillcheck-board" style={{ maxWidth: 340 }}>
          <DartBoard onHit={handleLabelClick} disabled={unlabeledCount === 0} />
          <p className="camera-confidence" style={{ marginTop: 8 }}>
            {unlabeledCount > 0
              ? `未ラベルの信号が${unlabeledCount}件あります。実際に投げた位置をクリックすると、直近の未ラベル信号に自動でラベルが付きます。`
              : '未ラベルの信号はありません。ボードに信号を送らせてから(投擲して)クリックしてください。'}
          </p>
        </div>

        <div className="skillcheck-side">
          <div className="camera-actions">
            <button className="btn-secondary" onClick={handleExport} disabled={log.length === 0}>
              ログをJSONでエクスポート({log.length}件)
            </button>
            <button className="btn-secondary" onClick={handleClearLog} disabled={log.length === 0}>
              ログをクリア
            </button>
          </div>

          <div className="throw-log-panel">
            <h3>受信ログ(新しい順)</h3>
            {log.length === 0 ? (
              <p className="throw-log-empty">まだ信号を受信していません。</p>
            ) : (
              <ul className="ble-log">
                {log.map((entry) => (
                  <li key={entry.id} className={entry.label ? 'ble-log-labeled' : ''}>
                    <span className="ble-log-time">{(entry.atMs / 1000).toFixed(2)}s</span>
                    <span className="ble-log-uuid">{entry.characteristicUuid.slice(0, 8)}</span>
                    <span className="ble-log-bytes">{entry.bytesHex || '(空)'}</span>
                    {entry.label && (
                      <span className="ble-log-label">
                        →{' '}
                        {entry.label.segment === 0
                          ? 'ミス'
                          : `${entry.label.multiplier === 3 ? 'T' : entry.label.multiplier === 2 ? 'D' : 'S'}${entry.label.segment}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
