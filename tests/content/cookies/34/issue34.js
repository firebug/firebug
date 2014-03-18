function runTest()
{
    FBTest.setPref("cookies.filterByPath", false);

    FBTest.openNewTab(basePath + "cookies/34/issue34.php", function(win)
    {
        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;
            var cookie = FBTest.getCookieByName(panelNode, "TestCookie34");

            editCookie(cookie);

            cookie = FBTest.getCookieByName(panelNode, "TestCookie34");
            FBTest.compare("ValueCookie34-modified", cookie.cookie.value, "Check new cookie value");
            FBTest.testDone();
        });
    });
};

function editCookie(cookie)
{
    FBTest.ok(cookie, "Cookie must exist.");
    if (!cookie)
        return;

    var uri = FW.FBL.makeURI(basePath);
    var host = uri.host;

    FBTest.sysout("cookies.test.issue34; this is our cookie", cookie);
    FBTest.compare(host, cookie.cookie.host, "Check cookie host.");

    // Open editCookie.xul dialog and edit the value.
    FBTest.sysout("cookies.test.issue34; let's edit an existing cookie");
    return FBTest.editCookie(cookie, function(dialog) {
        dialog.EditCookie.valueNode.value = cookie.cookie.value + "-modified";
        dialog.EditCookie.onOK();
    });
}
