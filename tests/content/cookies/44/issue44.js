function runTest()
{
    FBTest.sysout("cookies.test.issue44; START");

    FBTest.openNewTab(basePath + "cookies/44/issue44.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            // Verify JSON tab content
            FBTestFireCookie.verifyInfoTabContent(panelNode, "TestCookie44-JSON", "Json",
                /personObject\s*{\s*firstName=\"Jan\",\s*secondName=\"Honza\",\s*lastName=\"Odvarko\"}/);

            // Verify XML tab content
            FBTestFireCookie.verifyInfoTabContent(panelNode, "TestCookie44-XML", "Xml",
                "<person><firstname>Jan</firstname><secondname>Honza</secondname><lastname>Odvarko</lastname></person>");

            FBTest.testDone("cookies.test.issue44; DONE");
        });
    });
};
