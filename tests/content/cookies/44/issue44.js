function runTest()
{
    FBTest.setPref("cookies.filterByPath", false);

    FBTest.openNewTab(basePath + "cookies/44/issue44.php", function(win)
    {
        FBTest.enableCookiesPanel(function(win)
        {
            var panelNode = FBTest.selectPanel("cookies").panelNode;

            // Verify JSON tab content
            FBTest.verifyInfoTabContent(panelNode, "TestCookie44-JSON", "Json",
                /personObject\s*{\s*firstName=\"Jan\",\s*secondName=\"Honza\",\s*lastName=\"Odvarko\"}/);

            // Verify XML tab content
            FBTest.verifyInfoTabContent(panelNode, "TestCookie44-XML", "Xml",
                "<person><firstname>Jan</firstname><secondname>Honza</secondname><lastname>Odvarko</lastname></person>");

            FBTest.testDone();
        });
    });
};
