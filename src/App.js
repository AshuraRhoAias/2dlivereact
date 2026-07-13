import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { useEffect, useRef, useState } from 'react';
import './App.css';

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json';

const TAP_MOVE_THRESHOLD = 10;
const TAP_TIME_THRESHOLD = 500;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function App() {
  const containerRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const shadowRef = useRef(null);

  const posRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0, lastX: 0, lastY: 0, startTime: 0 });
  const dragDistanceRef = useRef(0);
  const rotationRef = useRef(0);
  const baseScaleRef = useRef(0.25);
  const bounceRef = useRef({ active: false, t: 0 });
  const timeRef = useRef(0);
  const motionGroupsRef = useRef([]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [motionGroups, setMotionGroups] = useState([]);
  const [expressions, setExpressions] = useState([]);
  const [scale, setScale] = useState(0.25);
  const [hintVisible, setHintVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let cancelled = false;
    let modelReady = false;
    window.PIXI = PIXI;

    const app = new PIXI.Application({
      width: container.clientWidth,
      height: container.clientHeight,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 0,
    });
    appRef.current = app;
    container.appendChild(app.view);
    app.view.style.touchAction = 'none';

    app.stage.interactive = true;
    app.stage.hitArea = new PIXI.Rectangle(0, 0, app.renderer.width, app.renderer.height);

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000);
    shadow.drawEllipse(0, 0, 70, 22);
    shadow.endFill();
    shadow.alpha = 0;
    shadowRef.current = shadow;
    app.stage.addChild(shadow);

    const clampPosition = (x, y) => {
      const model = modelRef.current;
      if (!model || !modelReady) return { x, y };
      const w = model.width;
      const h = model.height;
      const screenW = app.renderer.width / app.renderer.resolution;
      const screenH = app.renderer.height / app.renderer.resolution;
      const margin = 16;
      const minX = w / 2 + margin;
      const maxX = Math.max(minX, screenW - w / 2 - margin);
      const minY = h + margin;
      const maxY = Math.max(minY, screenH - margin);
      return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
    };

    const triggerBounce = () => {
      bounceRef.current = { active: true, t: 0 };
    };

    const reactToHit = (hitAreaNames) => {
      const groups = motionGroupsRef.current;
      if (!groups.length) return;
      let target = null;
      for (const name of hitAreaNames) {
        target = groups.find(
          (g) => g.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(g.toLowerCase())
        );
        if (target) break;
      }
      if (!target) target = groups.find((g) => g.toLowerCase() !== 'idle') || groups[0];
      modelRef.current?.motion(target);
    };

    const endDrag = () => {
      const model = modelRef.current;
      if (!dragRef.current.active || !model) return;
      dragRef.current.active = false;
      rotationRef.current = 0;
      model.cursor = 'grab';
      container.style.cursor = 'default';
      const elapsed = performance.now() - dragRef.current.startTime;
      if (dragDistanceRef.current < TAP_MOVE_THRESHOLD && elapsed < TAP_TIME_THRESHOLD) {
        triggerBounce();
      }
    };

    app.stage.on('pointermove', (e) => {
      if (!dragRef.current.active) return;
      const g = e.data.global;
      const dx = g.x - dragRef.current.lastX;
      const dy = g.y - dragRef.current.lastY;
      dragDistanceRef.current += Math.hypot(dx, dy);
      rotationRef.current = clamp(dx * 0.01, -0.3, 0.3);
      dragRef.current.lastX = g.x;
      dragRef.current.lastY = g.y;
      posRef.current = clampPosition(g.x - dragRef.current.offsetX, g.y - dragRef.current.offsetY);
    });
    app.stage.on('pointerup', endDrag);
    app.stage.on('pointerupoutside', endDrag);

    app.ticker.add(() => {
      const model = modelRef.current;
      if (!model || !modelReady) return;
      const deltaMS = app.ticker.deltaMS;
      timeRef.current += deltaMS;

      const floatOffset = dragRef.current.active ? 0 : Math.sin(timeRef.current * 0.0022) * 8;
      model.x = posRef.current.x;
      model.y = posRef.current.y + floatOffset;
      model.rotation += (rotationRef.current - model.rotation) * Math.min(1, deltaMS * 0.012);

      const s = baseScaleRef.current;
      if (bounceRef.current.active) {
        bounceRef.current.t += deltaMS;
        const p = Math.min(bounceRef.current.t / 260, 1);
        const wobble = Math.sin(p * Math.PI * 3) * (1 - p) * 0.14;
        model.scale.set(s * (1 + wobble), s * (1 - wobble));
        if (p >= 1) {
          bounceRef.current.active = false;
          model.scale.set(s, s);
        }
      }

      const shadowGfx = shadowRef.current;
      if (shadowGfx) {
        const liftFactor = 1 - Math.min(Math.abs(floatOffset) / 8, 1) * 0.25;
        const widthFactor = (model.width / 140) * liftFactor;
        shadowGfx.position.set(model.x, posRef.current.y + 4);
        shadowGfx.scale.set(widthFactor, widthFactor * 0.32);
        shadowGfx.alpha = 0.28 * liftFactor;
      }
    });

    const model = Live2DModel.fromSync(MODEL_URL, {
      autoInteract: true,
      onError: (err) => {
        if (cancelled) return;
        console.error('Live2D load error', err);
        setErrorMsg('No se pudo cargar el personaje. Comprueba tu conexión e inténtalo de nuevo.');
        setLoading(false);
      },
    });
    modelRef.current = model;

    model.once('load', () => {
      if (cancelled) {
        model.destroy();
        return;
      }
      const screenW = app.renderer.width / app.renderer.resolution;
      const screenH = app.renderer.height / app.renderer.resolution;

      model.anchor.set(0.5, 1);
      const targetHeight = screenH * 0.62;
      const initialScale = clamp(targetHeight / model.internalModel.height, 0.12, 0.6);
      baseScaleRef.current = initialScale;
      model.scale.set(initialScale, initialScale);

      posRef.current = { x: screenW / 2, y: screenH - 24 };
      model.x = posRef.current.x;
      model.y = posRef.current.y;
      model.interactive = true;
      model.cursor = 'grab';

      app.stage.addChild(model);

      model.on('pointerdown', (e) => {
        const g = e.data.global;
        dragRef.current = {
          active: true,
          offsetX: g.x - model.x,
          offsetY: g.y - model.y,
          lastX: g.x,
          lastY: g.y,
          startTime: performance.now(),
        };
        dragDistanceRef.current = 0;
        model.cursor = 'grabbing';
        container.style.cursor = 'grabbing';
        setHintVisible(false);
      });

      model.on('hit', (hitAreaNames) => {
        if (dragDistanceRef.current >= TAP_MOVE_THRESHOLD) return;
        reactToHit(hitAreaNames);
      });

      const settings = model.internalModel.settings;
      const groups = settings?.motions ? Object.keys(settings.motions) : [];
      const exprs = settings?.expressions
        ? settings.expressions.map((e, i) => e.Name || e.name || `Expresión ${i + 1}`)
        : [];
      motionGroupsRef.current = groups;
      setMotionGroups(groups);
      setExpressions(exprs);
      setScale(initialScale);
      setLoading(false);
      modelReady = true;
    });

    const handleResize = () => {
      if (!container || !appRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      appRef.current.renderer.resize(w, h);
      appRef.current.stage.hitArea = new PIXI.Rectangle(0, 0, w, h);
      if (modelRef.current) {
        posRef.current = clampPosition(posRef.current.x, posRef.current.y);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      modelRef.current = null;
      shadowRef.current = null;
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      appRef.current = null;
    };
  }, [reloadKey]);

  const handleScaleChange = (e) => {
    const value = Number(e.target.value);
    setScale(value);
    baseScaleRef.current = value;
    const model = modelRef.current;
    const app = appRef.current;
    if (!model || !app) return;
    if (!bounceRef.current.active) {
      model.scale.set(value, value);
    }
    const w = model.width;
    const h = model.height;
    const screenW = app.renderer.width / app.renderer.resolution;
    const screenH = app.renderer.height / app.renderer.resolution;
    const margin = 16;
    const minX = w / 2 + margin;
    const maxX = Math.max(minX, screenW - w / 2 - margin);
    const minY = h + margin;
    const maxY = Math.max(minY, screenH - margin);
    posRef.current = {
      x: clamp(posRef.current.x, minX, maxX),
      y: clamp(posRef.current.y, minY, maxY),
    };
  };

  const handleReset = () => {
    const app = appRef.current;
    if (!app) return;
    const screenW = app.renderer.width / app.renderer.resolution;
    const screenH = app.renderer.height / app.renderer.resolution;
    posRef.current = { x: screenW / 2, y: screenH - 24 };
    rotationRef.current = 0;
    bounceRef.current = { active: true, t: 0 };
  };

  const handleMotion = (group) => {
    modelRef.current?.motion(group);
    bounceRef.current = { active: true, t: 0 };
  };

  const handleExpression = (name) => {
    modelRef.current?.expression(name);
    bounceRef.current = { active: true, t: 0 };
  };

  return (
    <div className="app-root">
      <div className="bg-blob bg-blob-a" />
      <div className="bg-blob bg-blob-b" />

      <header className="top-bar">
        <h1>Live2D Character Studio</h1>
        <p>Arrastra al personaje, tócalo o usa el panel inferior para interactuar con él.</p>
      </header>

      <div className="stage-container" ref={containerRef} />

      {hintVisible && !loading && !errorMsg && (
        <div className="hint-toast">🖱️ Arrastra al personaje · toca para saludar</div>
      )}

      {loading && (
        <div className="overlay-layer loading-overlay">
          <div className="spinner" />
          <p>Cargando personaje…</p>
        </div>
      )}

      {errorMsg && (
        <div className="overlay-layer error-overlay">
          <p>{errorMsg}</p>
          <button
            type="button"
            className="pill-button primary"
            onClick={() => {
              setErrorMsg(null);
              setLoading(true);
              setReloadKey((k) => k + 1);
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !errorMsg && (
        <div className={`control-panel ${panelOpen ? 'open' : 'collapsed'}`}>
          <button
            type="button"
            className="panel-toggle"
            onClick={() => setPanelOpen((v) => !v)}
            aria-label={panelOpen ? 'Ocultar controles' : 'Mostrar controles'}
          >
            {panelOpen ? '▾' : '▴'}
          </button>

          {panelOpen && (
            <div className="panel-body">
              {expressions.length > 0 && (
                <div className="panel-row">
                  <span className="panel-label">Expresiones</span>
                  <div className="chip-scroller">
                    {expressions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="pill-button"
                        onClick={() => handleExpression(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {motionGroups.length > 0 && (
                <div className="panel-row">
                  <span className="panel-label">Movimientos</span>
                  <div className="chip-scroller">
                    {motionGroups.map((group) => (
                      <button
                        key={group}
                        type="button"
                        className="pill-button"
                        onClick={() => handleMotion(group)}
                      >
                        {group}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="panel-row panel-row-controls">
                <label className="scale-control">
                  Tamaño
                  <input
                    type="range"
                    min="0.12"
                    max="0.6"
                    step="0.01"
                    value={scale}
                    onChange={handleScaleChange}
                  />
                </label>
                <button type="button" className="pill-button primary" onClick={handleReset}>
                  ↺ Centrar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
