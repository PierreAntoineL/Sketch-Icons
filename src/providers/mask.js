import utils from '../utils/utils'
import svgProvider from './svg'
import librariesProvider from './libraries'
import logger from '../utils/logger'
import switchVersion from '../utils/switchV3ToV4';

export default {
  initAddMaskOnSelectedArtboards,
  addColor,
  removeMask,
  getMaskPropertiesFromArtboard,
  registerMask
}

/**
 * @name initAddMaskOnSelectedArtboards
 * @description main function to add mask on selected artboards
 * @param context {Object}
 * @param params {Object}
 * @param rootObjects {Array} : MSArtboardGroup
 */
function initAddMaskOnSelectedArtboards(context, params, rootObjects) {
  rootObjects.forEach(async (rootObject) => {
    if (utils.hasMask(rootObject.object) && !utils.svgHasStroke(rootObject.object)) removeMask(context, rootObject.object)
    await addColor(context, rootObject.object, params)
  })
  utils.clearSelection(context)
}

/**
 * @name applyColor
 * @description apply border color on svg with stroke
 * @param rootObject
 * @param params
 */
function applyColor(rootObject, params) {
  const color = (params.colorPicker) ? params.colorPicker : librariesProvider.getColorFromSymbol(params.color).color
  rootObject.children().forEach((layer) => {
    if (layer.styledLayer().style().hasEnabledBorder()) {
      const style = layer.styledLayer().style()
      style.enabledBorders().forEach((border) => {
        border.color = color
      })
    }
  })
}

/**
 * @name removeMask
 * @description remove all mask from artboard
 * @param context
 * @param rootObject {Object} : MSArtboardGroup
 */
function removeMask(context, rootObject) {

  context.command.setValue_forKey_onLayer(null, "colorLib", rootObject)
  context.command.setValue_forKey_onLayer(null, "color", rootObject)
  context.command.setValue_forKey_onLayer(null, "colorPicker", rootObject)

  if (utils.svgHasStroke(rootObject)) {
    return applyColor(rootObject, {colorPicker: MSImmutableColor.blackColor()})
  }

  const iconLayer = rootObject.firstLayer()

  if (iconLayer.hasClippingMask()) {
    iconLayer.hasClippingMask = false;
    iconLayer.clippingMaskMode = 1
    const style = rootObject.firstLayer().style()
    const fillColor = style.fills()[0].color()
    style.removeAllStyleFills()
    style.addStylePartOfType(0).color = fillColor

    rootObject.lastLayer().removeFromParent()
  }
}

/**
 * @name addColor
 * @description index function for all step to add mask and convert artboard to symbol at end
 * @param context {Object}
 * @param rootObject {Object} : MSArtboardGroup && MSSymbolMaster
 * @param params {Object}
 */
async function addColor(context, rootObject, params) {

  if (utils.svgHasStroke(rootObject)) {
    applyColor(rootObject, params);
  } else {

    if (utils.hasMask(rootObject)) {
      removeMask(context, rootObject)
    } else {
      const svgData = utils.layerToSvg(rootObject.firstLayer())
      await svgProvider.replaceSVG(context, rootObject, svgData, true, false)
    }

    applyMask(context, rootObject, params)
  }

  return registerMask(context, rootObject, params)
}


/**
 * @name registerMask
 * @description register properties of mask in artboard metadata
 * @param context
 * @param rootObject
 * @param params
 */
function registerMask(context, rootObject, params) {
  if (params.color) {
    const libraryId = (params.colorLib) ? params.colorLib.libraryID() : null
    const colorId = (typeof params.color === 'string') ? params.color : params.color.symbolID()

    context.command.setValue_forKey_onLayer(libraryId, "colorLib", rootObject)
    context.command.setValue_forKey_onLayer(colorId, "color", rootObject)
    context.command.setValue_forKey_onLayer(null, "colorPicker", rootObject)
  } else if (params.colorPicker) {
    context.command.setValue_forKey_onLayer(utils.convertMSColorToString(params.colorPicker), "colorPicker", rootObject)
    context.command.setValue_forKey_onLayer(null, "colorLib", rootObject)
    context.command.setValue_forKey_onLayer(null, "color", rootObject)
  }
}

function getMaskPropertiesFromArtboard(context, rootObject) {

  let params = getColorParams(context, rootObject)

  const maskLayer = rootObject.firstLayer()
  if (!params.colorLibraryId && !params.colorSymbolId && !params.colorString && maskLayer && maskLayer.hasClippingMask()) {
    switchVersion.switchToV4(context, rootObject)
    params = getColorParams(context, rootObject)
  }

  if (!params.colorLibraryId && params.colorSymbolId) {
    params.colorSymbol = librariesProvider.getSymbolFromDocument(context.document.documentData(), params.colorSymbolId)
  } else if (params.colorLibraryId) {
    params.colorLibrary = librariesProvider.getLibById(params.colorLibraryId)
    librariesProvider.loadLibrary(params.colorLibrary)
    params.colorSymbol = librariesProvider.getSymbolFromDocument(params.colorLibrary.document(), params.colorSymbolId)
  }

  params.colorPicker = (params.colorString) ? utils.convertStringToMSColor(params.colorString) : null


  const result = {
    colorLib: (params.colorLibraryId) ? params.colorLibrary : null,
    color: (params.colorSymbolId) ? params.colorSymbol : null,
    colorPicker: params.colorPicker
  }

  return (!result.colorLib && !result.color && !result.colorPicker) ? null : result
}

function getColorParams(context, rootObject) {
  return {
    colorLibraryId: context.command.valueForKey_onLayer("colorLib", rootObject),
    colorSymbolId: context.command.valueForKey_onLayer("color", rootObject),
    colorString: context.command.valueForKey_onLayer("colorPicker", rootObject)
  }
}


/**
 * @name createMaskFromNean
 * @param context
 * @param rootObject
 * @param color
 * @return {Object} : MSShapeGroup
 */
function createMaskFromNean(context, rootObject, color) {
  const currentRootObjectSize = rootObject.rect()

  const mask = MSShapeGroup.shapeWithRect({
    origin: {x: 0, y: 0},
    size: {width: currentRootObjectSize.size.width, height: currentRootObjectSize.size.height}
  })

  const fill = mask.style().addStylePartOfType(0);
  fill.color = color;

  return mask
}

/**
 * @name createMask
 * @description add mask from symbol master colors library to one artboard
 * @param context {Object}
 * @param colorSymbolMaster {Object}
 * @param colorLibrary {Object} : MSAssetLibrary
 * @return symbol {Object} : MSSymbolInstance
 */
function getMaskSymbolFromLib(context, colorSymbolMaster, colorLibrary) {
  utils.clearSelection(context)
  const librairiesController = AppController.sharedInstance().librariesController()
  const symbolMaster = (colorLibrary) ? librairiesController.importForeignSymbol_fromLibrary_intoDocument(colorSymbolMaster, colorLibrary, context.document.documentData()).symbolMaster() : colorSymbolMaster
  return symbolMaster.newSymbolInstance();
}

/**
 * @name applyMask
 * @param context
 * @param rootObject {Object} : MSArtboardGroup && MSSymbolMaster
 * @param params
 */
function applyMask(context, rootObject, params) {

  let mask;

  if (params.color) {
    mask = getMaskSymbolFromLib(context, params.color, params.colorLib)
  } else if (params.colorPicker) {
    mask = createMaskFromNean(context, rootObject, params.colorPicker)
  }

  const currentArtboardSize = rootObject.rect()
  mask.setHeightRespectingProportions(currentArtboardSize.size.height)
  mask.setWidthRespectingProportions(currentArtboardSize.size.width)
  mask.setName('🎨 color')
  rootObject.firstLayer().style().disableAllFills()
  rootObject.addLayers([mask])
  const iconLayer = rootObject.firstLayer()
  iconLayer.hasClippingMask = true
  iconLayer.clippingMaskMode = 0
}