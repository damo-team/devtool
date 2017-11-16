import _FormatMocker from '@ali/json-schema-mock/src/format';
import DataMocker from '@ali/json-schema-mock';
import JSONSchemaHelper from '@ali/json-schema-helper';
import {Api} from 'damo-core';
import jsonSchemaRef from './jsonSchemaRef';
import formatters from './formatter'

jsonSchemaRef.getRemoteRef = ( remotePath, next ) => {
  const schemaContext = Mocky.schemaContext;
  const remoteParts = remotePath.split('#');
  const schema = schemaContext(remoteParts[0]);
  
  if(schema){
    const chunk = JSONSchemaHelper.getChunkByPath(schema, '#' + remoteParts[1]);
    next( null, chunk );
  }else{
    Api.get( remoteParts[0], null).then(function(schema){
      // 添加对River规范的支持
      if( schema.response ){
          schema = schema.response;
      }

      const chunk = JSONSchemaHelper.getChunkByPath(schema, '#' + remoteParts[1]);

      next( null, chunk );
    }, function(error){
      next( error || new Error( '请求远端的ref错误' ) );
    });
  }
}

function FormatMocker(format, schema, customFormatMock){
  if(Mocky.formatters[format]){
    return Mocky.formatters[format]();
  }else{
    return _FormatMocker(format, schema, customFormatMock)
  }
}
/**
 * 解析 schema
 * @param {String|Object} schemaStr schema字符串，对象
 * @param {String} schemaType schema 类型,用于标识该类型是否为 mtop
 */
function parse(schema, schemaType) {
  let hasResetDefinitions = false;

  try{

    if (schemaType === 'mtop' && schema.properties.data.hasOwnProperty('definitions') ) {
      schema.definitions = schema.properties.data.definitions;
      hasResetDefinitions = true;
    }
  } catch(err) {}

  return new Promise(function(resolve, reject) {
    jsonSchemaRef(schema, {
      namespaceRemoteURL: Mocky.namespaceRemoteURL
    }, function(result) {
      if (hasResetDefinitions) {
        delete result.schema.definitions;
      }
      resolve(result);
    });

  });
};

function mock(schemaJSON, schemaType, customFormatMock, schemaContext) {

  return new Promise(function(resolve, reject) {

    // http://dip.alibaba-inc.com/api/v2/schemas/49959/format
    // 对schema进行解析
    parse(schemaJSON, schemaType, schemaContext).then(function(result) {
      let mockData = null;
      try {
        mockData = DataMocker(result.schema, customFormatMock);
      }catch (e) {
        reject(new Error('数据模拟出错: ' + e.message));
      }
      if(mockData){
        resolve(mockData);
      }else{
        resolve({});
      }
    });
  });

}

function noop(d){return d}

export default class Mocky{
  static formatters = formatters;

  static getRequestSchema = noop

  static getResponseSchema = noop

  static schemaContext = noop;

  static customFormatMock = null;

  static namespaceRemoteURL = null;

  $mockParams_ = {};

  setParams(id, mockParams){
    this.$mockParams_[id] = mockParams;
  }
  /**
   * 
   * @param {*} res 
   * @param {*} ajaxOption
   * 
   * ajaxOption = {
   *  method,
   *  mockParams
   * }
   */
  mock(res, id){
    const mockParams = this.$mockParams_[id];
    if(mockParams){
      return mock(Mocky.getResponseSchema(res, mockParams), mockParams.schemaType, Mocky.customFormatMock, Mocky.schemaContext);
    }else{
      return res;
    }
  }
}
