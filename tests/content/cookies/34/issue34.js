function runTest()
{
    FBTest.sysout("cookies.test.issue34; START");

    FBTestFirebug.openNewTab(basePath + "cookies/34/issue34.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win)
        {
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;
            var cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie34");

            editCookie(cookie);

            cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie34");
            FBTest.compare("ValueCookie34-modified", cookie.cookie.value, "Check new cookie value");
            FBTestFirebug.testDone("cookies.test.issue34; DONE");
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
    return FBTestFireCookie.editCookie(cookie, function(dialog) {
        dialog.EditCookie.valueNode.value = cookie.cookie.value + "-modified";
        dialog.EditCookie.onOK();
    });
}
