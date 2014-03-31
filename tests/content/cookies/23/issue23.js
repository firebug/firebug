var currentBaseURI = null;

function runTest()
{
    currentBaseURI = FW.FBL.makeURI(basePath);

    FBTest.clearCache();

    FBTest.openNewTab(basePath + "cookies/23/issue23.php", function(win)
    {
        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;
            var cookie = FBTest.getCookieByName(panelNode, "TestCookie23");

            editCookie(cookie);

            cookie = FBTest.getCookieByName(panelNode, "TestCookie23");
            FBTest.compare("ValueCookie23-modified", cookie.cookie.value, "Check new cookie value");
            FBTest.testDone();
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
    return FBTest.editCookie(cookie, function(dialog) {
        dialog.EditCookie.valueNode.value = cookie.cookie.value + "-modified";
        dialog.EditCookie.onOK();
    });
}
