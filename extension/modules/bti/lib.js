/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var EXPORTED_SYMBOLS = ["subclass"];

// ************************************************************************************************
// API

function subclass(obj)
{
    function F(){}
    F.prototype = obj;
    return new F();
}
