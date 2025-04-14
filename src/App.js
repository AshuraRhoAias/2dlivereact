import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // expose PIXI to window so that this plugin is able to
    // reference window.PIXI.Ticker to automatically update Live2D models
    window.PIXI = PIXI;

    const app = new PIXI.Application({
      view: document.getElementById('canvas'),
    });

    // no `await` here as it's not a Promise
    const model = Live2DModel.fromSync('https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json');

    model.once('load', () => {
      // now it's safe
      app.stage.addChild(model);
      model.scale.set(0.25);
      model.x = 10;
    });
  }, [])
  return (
    <div>
      <canvas id="canvas"></canvas>
    </div>
  );
}

export default App;