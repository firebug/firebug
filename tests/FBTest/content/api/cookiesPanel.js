/* See license.txt for terms of usage */

const Cc = Components.classes;
const Ci = Components.interfaces;

// Performed in every test when this file is loaded.
Components.classes["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager).removeAll();

(function() {

// ************************************************************************************************
// Constants

var winWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);

// ************************************************************************************************
// Firecookie testing APIs

/**
 * Enables Cookies panel
 * @param {Function} callback Executed as soon as the panel is enabled.
 */
this.enableCookiesPanel = function(callback)
{
    FBTestFirebug.setPanelState(FW.Firebug.CookieModule, "cookies", callback, true);
};

/**
 * Returns <TR> element that represents specified cookie in the Cookies panel.
 * @param {Element} panelNode Cookies panel node.
 * @param {String} cookieName Name of the cookie under inspection.
 */
this.getCookieRowByName = function(panelNode, cookieName)
{
    var cookieRows = FW.FBL.getElementsByClass(panelNode, "cookieRow");
    for (var i=0; i<cookieRows.length; i++)
    {
        var row = cookieRows[i];
        var label = FW.FBL.getElementsByClass(row, "cookieNameLabel");
        if (label.length != 1)
            return null;

        if (label[0].textContent == cookieName)
            return row;
    }
    return null;
};

/**
 * Returns cookie object (the repObject) according to the specified name.
 * @param {Element} panelNode Cookies panel node.
 * @param {String} cookieName Name of the cookie under inspection.
 */
this.getCookieByName = function(panelNode, cookieName)
{
    var row = this.getCookieRowByName(panelNode, cookieName);
    return row ? row.repObject : null;
};

/**
 * Expands specified cookie.
 *
 * @param {Element} panelNode Cookie panel node returned e.g. by {@link FBTestFirebug.selectPanel} method.
 * @param {String} cookieName Name of the cookie to be expanded
 * @param {String} infoTab Name of the tab to be selected (Value, RawValue, Json, Xml).
 * @returns If a default <i>infoTab</i> is specified the return value is content of the tab,
 *      (for example <i>cookieInfoValueText</i> element). If no tab is specified the info
 *      row element (created just after cookie row with class <i>cookieInfoRow</i>) is returned.
 */
this.expandCookie = function(panelNode, cookieName, infoTab)
{
    var row = this.getCookieRowByName(panelNode, cookieName);
    if (!row)
        FBTest.ok(row, cookieName + " must exist.");

    // Expand only if not already expanded
    if (!FW.FBL.hasClass(row, "opened"))
        FBTest.click(row);

    var cookieInfo = row.nextSibling;
    if (!FW.FBL.hasClass(cookieInfo, "cookieInfoRow"))
        FBTest.ok(false, "Cookie info row doesn't have proper class");

    if (!infoTab)
        return cookieInfo;

    FBTestFirebug.expandElements(cookieInfo, "cookieInfo" + infoTab + "Tab");
    return cookieInfo.querySelector(".cookieInfo" + infoTab + "Text");
};

/**
 * Verifies content of specified tab for given cookie.
 *
 * @param {Element} panelNode Cookie panel node.
 * @param {String} cookieName Name of the cookie under inspection.
 * @param {String} tabName Name of the tab under inspection (Value, RawValue, Json, Xml)
 * @param {Object} expected Expected value (can be regular expression)
 */
this.verifyInfoTabContent = function(panelNode, cookieName, tabName, expected)
{
    var info = this.expandCookie(panelNode, cookieName, tabName);
    FBTest.compare(expected, info ? info.textContent : "",
        "Expected " + tabName + " value must be displayed for " + cookieName);
}

/**
 * Remove specified cookie by name.
 * @param {String} Name of the cookie to be removed.
 */
this.removeCookie = function(host, name, path)
{
    FW.Firebug.CookieModule.removeCookie(host, name, path);
}

/**
 * Opens 'Edit Cookie' dialog. Since the dialog is modal, the method returns
 * after its closed. Use the callback to close the dialog.
 *
 * @param {Object} cookie Cookie being edited
 * @param {Function} callback Callback for dialog manipulation
 */
this.editCookie = function(cookie, callback)
{
    var watcherObserver =
    {
        observe: function(subject, topic, data)
        {
            if (topic == "domwindowopened")
            {
                winWatcher.unregisterNotification(watcherObserver);
                setTimeout(function()
                {
                    var dialog = subject.QueryInterface(Ci.nsIDOMWindow);
                    FBTest.compare("chrome://firebug/content/cookies/editCookie.xul",
                        dialog.document.location.href, "The 'Edit Cookie' dialog is opened.");
                    FBTest.ok(dialog.EditCookie, "The EditCookie variable must exist.");
                    callback(dialog);

                //xxxHonza: increasing from 300 to 500ms to see
                // if it helps to solve Mac failures.
                }, 500);
            }
        }
    };

    winWatcher.registerNotification(watcherObserver);
    return FW.Firebug.CookieModule.CookieReps.CookieRow.onEdit(cookie);
};

/**
 * Click on a button within the test case page.
 * @param {Object} win
 * @param {Object} buttonId
 */
this.clickTestButton = function(win, buttonId)
{
    var win = FW.FBL.unwrapObject(win);
    FBTest.click(win.document.getElementById(buttonId));
}

// ************************************************************************************************
}).apply(FBTest);
