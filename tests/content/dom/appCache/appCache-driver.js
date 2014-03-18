function runTest()
{
    FBTest.openNewTab(basePath + "dom/appCache/appCache.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FW.Firebug.chrome.selectPanel("dom");

            var href = win.location.href;
            var i = href.lastIndexOf(".");
            var itemURL = href.substr(0, i) + ".js";

            var tasks = new FBTest.TaskList();
            tasks.push(testAddOfflinePermission, win);
            tasks.push(testClearAppCache, win, itemURL);
            tasks.push(verifyNumberOfItems, win, 0);
            tasks.push(executeTest, win, itemURL);
            tasks.push(verifyNumberOfItems, win, 1);
            tasks.push(testClearOfflinePermission, win);

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function testAddOfflinePermission(callback, win)
{
    FBTest.clearCache();
    addOfflinePermission(win);
    FBTest.reload(callback);
}

function testClearOfflinePermission(callback, win)
{
    FBTest.clearCache();
    clearOfflinePermission(win);
    FBTest.reload(callback);
}

function testClearAppCache(callback, win, itemURL)
{
    FBTest.clearCache();
    clearAppCache(win)

    try
    {
        win.applicationCache.mozRemove(itemURL);
    }
    catch (err)
    {
        FBTest.progress(err);
    }

    FBTest.reload(callback);
}

function executeTest(callback, win, itemURL)
{
    FBTest.clearCache();

    waitForAdd(win, itemURL, function()
    {
        callback();
    });

    FBTest.click(win.document.getElementById("addButton"));
}

function verifyNumberOfItems(callback, win, count)
{
    FBTest.waitForDOMProperty("applicationCache", function(row)
    {
        var regexp = new RegExp("\s*applicationCache\s*" + count + " items in offline cache\s*");
        FBTest.compare(regexp, row.textContent,
            "There must be " + count + " item in the applicationCache.");
        callback();
    });

    FBTest.reload();
}

// ********************************************************************************************* //

function addOfflinePermission(win)
{
    var pm = Cc["@mozilla.org/permissionmanager;1"]
      .getService(Ci.nsIPermissionManager);
    var uri = Cc["@mozilla.org/network/io-service;1"]
      .getService(Ci.nsIIOService)
      .newURI(win.location.href, null, null);

    if (pm.testPermission(uri, "offline-app") != 0)
      FBTest.progress("Previous test failed to clear offline-app permission");

    pm.add(uri, "offline-app", Ci.nsIPermissionManager.ALLOW_ACTION);
}

function clearOfflinePermission(win)
{
    var pm = Cc["@mozilla.org/permissionmanager;1"]
        .getService(Ci.nsIPermissionManager);
    var uri = Cc["@mozilla.org/network/io-service;1"]
        .getService(Ci.nsIIOService)
        .newURI(win.location.href, null, null);

    pm.remove(uri.host, "offline-app");
}

function clearAppCache(win)
{
    // XXX: maybe we should just wipe out the entire disk cache.
    var appCache = getActiveCache(win);
    if (appCache)
        appCache.discard();
}

function getManifestUrl(win)
{
    return win.document.documentElement.getAttribute("manifest");
}

function getActiveCache(win)
{
    // Note that this is the current active cache in the cache stack, not the
    // one associated with this window.
    var serv = Cc["@mozilla.org/network/application-cache-service;1"]
        .getService(Ci.nsIApplicationCacheService);

    return serv.getActiveCache(getManifestUrl(win));
}

// The offline API as specified has no way to watch the load of a resource
// added with applicationCache.mozAdd().
function waitForAdd(win, itemURL, onFinished)
{
    // Check every half second.
    var numChecks = 15;
    var waitFunc = function()
    {
        var hasItem = false;
        try {
            hasItem = win.applicationCache.mozHasItem(itemURL)
        } catch (e) {
        }

        if (hasItem)
        {
            FBTest.progress("Wait for add: item is there");
            onFinished();
            return;
        }

        if (--numChecks == 0)
        {
            FBTest.progress("Wait for add: timeout");
            onFinished();
            return;
        }

        setTimeout(waitFunc, 500);
    }

    setTimeout(waitFunc, 500);
}
