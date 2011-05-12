/* See license.txt for terms of usage */

define([
],
function()
{
// ---- Browser.xul dependent code ----------
function getBrowserDocument()
{
    return top.document;
}

// ---- Browser.xul independent code ----------
var Firefox =
{
    getElementById: function(id)
    {
        return getBrowserDocument().getElementById(id);
    },
    getTabBrowser: function()
    {
        var tabBrowser = Firefox.getElementById("content");
        return tabBrowser;
    },
    getCurrentBrowser: function()
    {
        return Firefox.getTabBrowser().selectedBrowser;
    },
    getBrowsers: function()
    {
        return Firefox.getTabBrowser().browsers;
    },
    selectTabByWindow: function(win)
    {
        var tabBrowser = Firefox.getTabBrowser();
        var tab = tabBrowser.getBrowserForDocument(win.document);
        tabBrowser.selectedBrowser = tab;
    },
    getCurrentURI: function()
    {
        try
        {
            return Firefox.getTabBrowser().currentURI;
        }
        catch (exc)
        {
            return null;
        }
    },

};

//************************************************************************************************

//XXXjoe This horrible hack works around a focus bug in Firefox which is caused when
//the HTML Validator extension and Firebug are installed.  It causes the keyboard to
//behave erratically when typing, and the only solution I've found is to delay
//the initialization of HTML Validator by overriding this function with a timeout.
//XXXrobc Do we still need this? Does this extension even exist anymore?
if (top.hasOwnProperty('TidyBrowser'))
{
 var prev = TidyBrowser.prototype.updateStatusBar;
 TidyBrowser.prototype.updateStatusBar = function()
 {
     var self = this, args = arguments;
     setTimeout(function()
     {
         prev.apply(self, args);
     });
 }
}

return Firefox;
});
