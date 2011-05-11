/* See license.txt for terms of usage */

define([
],
function()
{
// ---- Browser.xul dependent code ----------
function getBrowserDocument(context)
{
    return document;
}

// ---- Browser.xul dependent code ----------
var Firefox =
{
    getElementById: function(id)
    {
        return getBrowserDocument().getElementById(id);
    },

};

return Firefox;
});
