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

// At least sometimes the keys will be on user-level window objects
Arr.keys = function(map)
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
 * Filter out unique values of an array, saving only the first occurrence of
 * every value. In case the array is sorted, a faster path is taken.
 */
Arr.unique = function(ar, sorted)
{
    var ret = [], len = ar.length;
    if (sorted)
    {
        for (var i = 0; i < len; ++i)
        {
            // Skip duplicated entries
            if (i && ar[i-1] === ar[i])
                continue;
            ret.push(ar[i]);
        }
    }
    else
    {
        // Keep a map whose ","-prefixed keys represent the values that have
        // occurred so far in the array (this avoids overwriting e.g. __proto__).
        var map = {};
        for (var i = 0; i < len; ++i)
        {
            if (!map.hasOwnProperty("," + ar[i]))
            {
                ret.push(ar[i]);
                map["," + ar[i]] = 1;
            }
        }
    }
    return ret;
};

/**
 * Sort an array and eliminate duplicates from it.
 */
Arr.sortUnique = function(ar, sortFunc)
{
    return Arr.unique(ar.slice().sort(sortFunc), true);
};

/**
 * Merge together two arrays, sort the result, and eliminate any duplicates.
 */
Arr.merge = function(arr1, arr2, sortFunc)
{
    return Arr.sortUnique(arr1.concat(arr2), sortFunc);
};

// ********************************************************************************************* //

return Arr;

// ********************************************************************************************* //
});
