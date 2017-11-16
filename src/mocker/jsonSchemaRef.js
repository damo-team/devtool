var _ = require( 'lodash' );
var JSONSchemaHelper = require( '@ali/json-schema-helper' );

/**
 * 获取本地的ref
 * @param schema
 * @param refPath
 */
function getLocalRef( schema, refPath ){
    return JSONSchemaHelper.getChunkByPath( schema, refPath );
}

/**
 * 获取远端的ref内容
 * @param remotePath
 * @param next
 */
function getRemoteRef( remotePath, next ){

    var remoteParts = remotePath.split('#');
    // var request = require('request');
    var request = function(){};
    request( remoteParts[0], function (error, response, body) {
        if (!error && response.statusCode == 200) {

            try {
                var schema = JSON.parse( body );
            }
            catch( e ){
                return next( e );
            }

            // 添加对River规范的支持
            if( schema.response ){
                schema = schema.response;
            }

            var chunk = JSONSchemaHelper.getChunkByPath(schema, '#' + remoteParts[1]);

            next( null, chunk );
        }
        else {
            next( error || new Error( '请求远端的ref错误' ) );
        }
    });
}

function getNameSpaceRemoteRef( schemaName, options, next ){
    if( typeof options == 'function' ){
        next = options;
        options = {};
    }
    var remoteURL = 'http://dip.alibaba-inc.com/api/v2/schemas/' + encodeURIComponent( schemaName ) + '/content';

    if( typeof options.namespaceRemoteURL == 'function' ){
        remoteURL = options.namespaceRemoteURL( schemaName );
    }

    parser.getRemoteRef( remoteURL, next );
}

/**
 * 递归地遍历一个JSON对象
 * @param {Array|Object} json
 * @param {Function} [iterator] 迭代器 iterator( path, value )
 * @param {String} parentPath
 */
function recurJSON( json, iterator, parentPath ){

    iterator = iterator || function(){};
    parentPath = parentPath || '#';

    if(_.isArray( json ) || _.isPlainObject( json ) ){
        _.forEach( json, function( value, key ){

            var currentKey = parentPath + '/' + key;

            iterator( key, value, currentKey );

            if(_.isArray( value ) || _.isPlainObject( value ) ){
                recurJSON( value, iterator, currentKey );
            }
        });
    }
    else {
        throw new Error( '只接受Array或者Object类型JSON对象' );
    }
}

/**
 * 检查是否包含 $ref 关键字，直接通过JSON字符串序列化的方式检查
 * @param schema
 */
function ifContainRef( schema ){
    return /"\$ref"\:/.test( JSON.stringify( schema ) );
}

/**
 * 对schema 进行解析，若遇到$ref则进行替换
 * @param schema
 * @param {Object} options
 * @param {Object} options.refs 可以预设refs的 key value值，如 { refs: { 'http://taobao.com/schema.json': { ..schema ... } }
 *                              则在查找到该 $ref 时，会直接进行匹配
 * @param {Function} options.refHandle
 * @param next 回掉函数 next({ refs: { .. 解析到的所有结果... }, schema: 替换掉 $ref 的schema });
 */
function parser( schema, options, next ){

    if(_.isFunction( options ) ){
        next = options;
        options = {};
    }

    options = options || {};
    schema = _.cloneDeep( schema );
    var refs = {};
    var pending = 0;
    var finished = 0;

    // 递归遍历JSON的路径
    recurJSON( schema, function( key, value, path ){

        // 若为$ref，且确实为关键词
        if( key === '$ref' && JSONSchemaHelper.ifKeyword( path ) ){

            pending++;

            var refValue = _.isFunction( options.refHandle ) ? options.refHandle( value ) : value;

            process.nextTick(function(){

                var refSchema = null;

                if( !refs[ value ] ) {
                    refs[ value ] = {
                        error: null,
                        schema: null,
                        path: path
                    };
                }

                //if( refs[ value ].schema ){
                //    resultCheck( path, refs[ value ].schema, value );
                //}

                // 检查是否已经匹配到options
                if( value in ( options.refs || {} ) ){
                    refSchema = options.refs[ value ];
                    resultCheck( path, refSchema, value );
                }
                // 检查是否为内部ref
                else if( refValue.indexOf( '#/' ) == 0 ){
                    refSchema = getLocalRef( schema, refValue );
                    resultCheck( path, refSchema, value );
                }
                // 检查是否为外部ref
                else if( refValue.indexOf( 'http://' ) >= 0 ){
                    getRemoteRef( refValue, function( e, ret ){
                        refs[ value ].error = e;
                        resultCheck( path, ret, value );
                    });
                }
                // 若为命名空间类型
                else if( /[^\/@]+\/[^\/@]+(@[\d\.]+)?/.test( refValue ) ){
                    getNameSpaceRemoteRef( refValue, options, function( e, ret ){
                        refs[ value ].error = e;
                        resultCheck( path, ret, value );
                    });
                }
                else {
                    // 不知道是什么的 ref 就不要管了
                    resultCheck( path, null, value );
                }
            });
        }
    });

    // 直接检查一遍，避免不包含ref的情况
    finishCheck();

    /**
     * 对结果进行检查
     * @param refPath
     * @param refSchema
     * @param refValue
     */
    function resultCheck( refPath, refSchema, refValue ){

        if( refSchema ){

            var refParPath = JSONSchemaHelper.getParentPath( refPath );
            var parentSchema = JSONSchemaHelper.getChunkByPath( schema, refParPath );
            var required = parentSchema.required;

            // 检查是否还包含ref
            if( ifContainRef( refSchema ) ){

                // 递归查找ref
                parser( refSchema, options, function( result ){
                    // 合并在查找过程中解析到的refs
                    refs = _.merge( refs, result.refs );
                    // 在refs中只记录未被required过的schema
                    refs[ refValue ].schema = result.schema;
                    // 若包含required，进行进行过滤
                    refSchema = handleRequired( result.schema, required );

                    schema = JSONSchemaHelper.setChunkByPath( schema, refParPath, refSchema );
                    finished++;

                    finishCheck();
                });
            }
            else {
                refs[ refValue ].schema = refSchema;
                refSchema = handleRequired( refSchema, required );
                // 若包含required，进行进行过滤
                schema = JSONSchemaHelper.setChunkByPath( schema, refParPath, refSchema );
                finished++;

                finishCheck();
            }
        }
        else {
            finished++;

            finishCheck();
        }
    }

    /**
     * 对包含了required的关键词进行处理，过滤掉未出现在required中的字段
     * @param s
     * @param required
     * @returns {*}
     */
    function handleRequired( s, required ){
        if( !required || !_.isArray( required  ) ){
            return s;
        }
        else {

            if( s.type == 'object' && s.properties ){

                s = _.cloneDeep( s );

                s.required = _.union( s.required, required );


                return s;
            }
            else {
                return s;
            }
        }
    }

    /**
     * 检查是否所有任务都已经完成了
     */
    function finishCheck(){

        if( finished == pending ){
            next && next({
                refs: refs,
                schema: schema
            });
        }
    }
}

parser.getRemoteRef = getRemoteRef;

module.exports = parser;
