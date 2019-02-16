/* Copyright 2017 Esri
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import esriConfig from 'esri/config';
import SceneView from 'esri/views/SceneView';
import WebScene from 'esri/WebScene';


import {
  INIT_SCENE,
  SELECTION_SET,
  SELECTION_ADD,
  SELECTION_REMOVE,
  SELECTION_RESET,
  SET_ENVIRONMENT,
  SET_DATE,
  SET_SHADOWS,
} from '../constants/action-types';

import { registerClickEvent } from './arcgis-sceneview/interaction';
import { updateHighlights } from './arcgis-sceneview/highlights';
import { setEnvironment } from './arcgis-sceneview/environment';


esriConfig.request.corsEnabledServers.push('a.tile.stamen.com');
esriConfig.request.corsEnabledServers.push('b.tile.stamen.com');
esriConfig.request.corsEnabledServers.push('c.tile.stamen.com');
esriConfig.request.corsEnabledServers.push('d.tile.stamen.com');


const arcgis = {};

window.arcgis = arcgis;

/**
 * Middleware function with the signature
 *
 * storeInstance =>
 * functionToCallWithAnActionThatWillSendItToTheNextMiddleware =>
 * actionThatDispatchWasCalledWith =>
 * valueToUseAsTheReturnValueOfTheDispatchCall
 *
 * Typically written as
 *
 * store => next => action => result
 */
const arcgisMiddleWare = store => next => (action) => {
  switch (action.type) {
    /**
     * Initialize scene view on a viewport container.
     */
    case INIT_SCENE: {
      if (!action.id || !action.container) break;

      // if sceneview container is already initialized, just add it back to the DOM.
      if (arcgis.container) {
        action.container.appendChild(arcgis.container);
        break;
      }

      // Otherwise, create a new container element and a new scene view.
      arcgis.container = document.createElement('DIV');
      action.container.appendChild(arcgis.container);
      arcgis.sceneView = new SceneView({ container: arcgis.container });

      registerClickEvent(arcgis.sceneView, store);

      // Initialize web scene
      const webScene = new WebScene({ portalItem: { id: action.id } });
      arcgis.sceneView.map = webScene;

      // When initialized...
      return webScene
        .then(() => {
          webScene.layers.items.forEach((layer) => { layer.popupEnabled = false; });

          next({ ...action, name: webScene.portalItem.title });

          return arcgis.sceneView.whenLayerView(webScene.layers.getItemAt(0));
        })
        .then(() => {
          // Update the environment settings (either from the state or from the scene)
          const webSceneEnvironment = arcgis.sceneView.map.initialViewProperties.environment;
          const date = new Date(webSceneEnvironment.lighting.date);
          date.setUTCHours(date.getUTCHours() + webSceneEnvironment.lighting.displayUTCOffset);

          const { environment } = store.getState();

          store.dispatch({
            type: SET_ENVIRONMENT,
            date: environment.date !== null ? environment.date : date,
            UTCOffset: webSceneEnvironment.lighting.displayUTCOffset,
            shadows: environment.shadows !== null ?
              environment.shadows :
              webSceneEnvironment.lighting.directShadowsEnabled,
          });

          // Update the selection highlights
          const { selection } = store.getState();
          updateHighlights(arcgis.sceneView, selection);
        });
    }


    /**
     * Update highlights and reports on selection change.
     */
    case SELECTION_SET:
    case SELECTION_ADD:
    case SELECTION_REMOVE:
    case SELECTION_RESET: {
      next(action);

      // Update needs to happen after the action dispatched, to have the correct selection.
      const { selection } = store.getState();
      updateHighlights(arcgis.sceneView, selection);

      break;
    }

    case SET_ENVIRONMENT:
    case SET_DATE:
    case SET_SHADOWS: {
      next(action);

      // Update needs to happen after the action dispatched, to have the correct environment.
      const { environment: { date, utcoffset, shadows } } = store.getState();
      const newDate = new Date(date);
      newDate.setUTCHours(newDate.getUTCHours() - utcoffset);
      setEnvironment(arcgis.sceneView, newDate, utcoffset, shadows);
      break;
    }

    default: {
      next(action);
      break;
    }
  }

  return Promise.resolve();
};


export default arcgisMiddleWare;
