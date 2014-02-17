function runTest()
{
    FBTest.sysout("issue5560.START");

    FBTest.openNewTab(basePath + "cookies/5560/issue5560.php", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("cookies");

        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;
            var cookie = FBTest.getCookieByName(panelNode, "TestCookie5560");
            var rawValue = cookie.row.getElementsByClassName("cookieRawValueCol").item(0);

            FBTest.compare("%23", rawValue.textContent, "The raw value of the cookie must be displayed correctly.");
            FBTest.testDone("issue5560.DONE");
        });
    });
}
