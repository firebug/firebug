var currentBaseURI = null;

function runTest()
{
    FBTest.sysout("cookies.test.issue23; START");

    currentBaseURI = FW.FBL.makeURI(basePath);

    FBTest.clearCache();

    FBTest.openNewTab(basePath + "cookies/23/issue23.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;
            var cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie23");

            editCookie(cookie);

            cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie23");
            FBTest.compare("ValueCookie23-modified", cookie.cookie.value, "Check new cookie value");
            FBTest.testDone("cookies.test.issue23; DONE");
        });
    });
};

function editCookie(cookie)
{
    FBTest.ok(cookie, "Cookie must exist.");
    if (!cookie)
        return;

    var host = currentBaseURI.host;

    FBTest.sysout("cookies.test.issue23; this is our cookie", cookie);
    FBTest.compare(host, cookie.cookie.host, "Check cookie host.");

    // Open editCookie.xul dialog and edit the value.
    FBTest.sysout("cookies.test.issue23; let's edit an existing cookie");
    return FBTestFireCookie.editCookie(cookie, function(dialog) {
        dialog.EditCookie.valueNode.value = cookie.cookie.value + "-modified";
        dialog.EditCookie.onOK();
    });
}
