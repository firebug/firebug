function runTest()
{
    FBTest.openNewTab(basePath + "html/style/6281/issue6281.html", function(win)
    {
        var elementID = "textinput";
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel(elementID, function(sel)
            {
                FBTest.progress("issue6281; selection:", sel);

                var sidePanel = FBTest.selectSidePanel("css");
                var rules = sidePanel.panelNode.getElementsByClassName("cssRule");

                var ruleExists = false;
                for (var i = 0; i < rules.length; i++)
                {
                    var selector = rules[i].getElementsByClassName("cssSelector").item(0).textContent;
                    if (selector == "#" + elementID + "::-moz-placeholder")
                    {
                        FBTest.ok(true, "::-moz-placeholder pseudo-element rule exists");
                        ruleExists = true;
                        break;
                    }
                }

                if (!ruleExists)
                    FBTest.ok(false, "::-moz-placeholder pseudo-element rule does not exist");

                FBTest.testDone();
            });
        });
    });
}
