/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

const Ci = Components.interfaces;
const Cu = Components.utils;

var Arr = {};

// ********************************************************************************************* //
// Array

Arr.isArray = Array.isArray || function(obj)
{
    return Object.prototype.toString.call(obj) === "[object Array]";
};

Arr.cloneArray = function(array, fn)
{
   var newArray = [], len = array.length;

   if (fn)
       for (var i = 0; i < len; ++i)
           newArray.push(fn(array[i]));
   else
       for (var i = 0; i < len; ++i)
           newArray.push(array[i]);

   return newArray;
};

Arr.extendArray = function(array, array2)
{
   var newArray = [];
   newArray.push.apply(newArray, array);
   newArray.push.apply(newArray, array2);
   return newArray;
};

Arr.arrayInsert = function(array, index, other)
{
   for (var i = 0; i < other.length; ++i)
       array.splice(i+index, 0, other[i]);

   return array;
};

// ********************************************************************************************* //

return Arr;

// ********************************************************************************************* //
});
