/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Arr = {};

// ********************************************************************************************* //
// Arrays

Arr.isArray = function(obj)
{
    if (Array.isArray)
        return Array.isArray(obj);

    return Object.prototype.toString.call(obj) === "[object Array]";
}

Arr.keys = function(map)  // At least sometimes the keys will be on user-level window objects
{
    var keys = [];
    try
    {
        for (var name in map)  // enumeration is safe
            keys.push(name);   // name is string, safe
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
    }

    return keys;  // return is safe
};

Arr.values = function(map)
{
    var values = [];
    try
    {
        for (var name in map)
        {
            try
            {
                values.push(map[name]);
            }
            catch (exc)
            {
                // Sometimes we get exceptions trying to access properties
                if (FBTrace.DBG_ERRORS)
                    FBTrace.dumpPropreties("lib.values FAILED ", exc);
            }

        }
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
        if (FBTrace.DBG_ERRORS)
            FBTrace.dumpPropreties("lib.values FAILED ", exc);
    }

    return values;
};

Arr.remove = function(list, item)
{
    for (var i = 0; i < list.length; ++i)
    {
        if (list[i] == item)
        {
            list.splice(i, 1);
            return true;
        }
    }
    return false;
};

Arr.sliceArray = function(array, index)
{
    var slice = [];
    for (var i = index; i < array.length; ++i)
        slice.push(array[i]);

    return slice;
};

Arr.cloneArray = function(array, fn)
{
   var newArray = [];

   if (fn)
       for (var i = 0; i < array.length; ++i)
           newArray.push(fn(array[i]));
   else
       for (var i = 0; i < array.length; ++i)
           newArray.push(array[i]);

   return newArray;
}

Arr.extendArray = function(array, array2)
{
   var newArray = [];
   newArray.push.apply(newArray, array);
   newArray.push.apply(newArray, array2);
   return newArray;
}

Arr.arrayInsert = function(array, index, other)
{
   for (var i = 0; i < other.length; ++i)
       array.splice(i+index, 0, other[i]);

   return array;
}

/**
 * Merge two arrays and keep only unique values.
 * 
 * @param {Array} arr1 The first array to merge.
 * @param {Array} arr2 The second array to merge.
 * @param {Function} sortFunc Optional function for proper sorting of objects in arrays.
 */
Arr.merge = function(arr1, arr2, sortFunc)
{
    var ar = Arr.extendArray(arr1, arr2);
    ar.sort(sortFunc);

    var ret = [];
    for (var i=0; i<ar.length; i++)
    {
        // Skip duplicated entries
        if (i && ar[i-1] === ar[i])
            continue;
        ret.push(ar[i]);
    }

    return ret;
}

// ********************************************************************************************* //

return Arr;

// ********************************************************************************************* //
});
