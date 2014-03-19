function runTest()
{
    FBTest.setPref("cookies.filterByPath", false);

    FBTest.openNewTab(basePath + "cookies/general/editCookies.php", function(win)
    {
        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;
            var cookie = FBTest.getCookieByName(panelNode, "EditCookie3");

            editCookie(cookie);

            cookie = FBTest.getCookieByName(panelNode, "EditCookie3");
            FBTest.compare("newvalue", cookie.cookie.value, "Check cookie value");
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

    FBTest.compare(host, cookie.cookie.host, "Check cookie host.");

    // Open editCookie.xul dialog and edit the value.
    FBTest.sysout("cookies.test.issue34; let's edit an existing cookie");
    return FBTest.editCookie(cookie, function(dialog) {
        dialog.EditCookie.valueNode.value = "newvalue";
        dialog.EditCookie.onOK();
    });
}
