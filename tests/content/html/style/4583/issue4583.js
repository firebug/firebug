function runTest()
{
    FBTest.openNewTab(basePath + "html/style/4583/issue4583.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("elementWithOverwrittenStyles", function(node)
            {
                var sidePanel = FBTest.selectSidePanel("css");
                var selectors = sidePanel.panelNode.querySelectorAll(".cssSelector");
                var rules = [];

                for(var i=0; i<selectors.length; i++)
                {
                    if (selectors[i].textContent == "#elementWithOverwrittenStyles")
                    {
                        var rule = FW.FBL.getAncestorByClass(selectors[i], "cssRule");
                        rules.push(rule);
                    }
                }

                if (FBTest.compare(2, rules.length, "There must be two '#elementWithOverwrittenStyles' CSS rules."))
                {
                    var props = rules[0].querySelectorAll(".cssProp");
                    for (var i=0; i<props.length; i++)
                    {
                        var propName = props[i].querySelector(".cssPropName").textContent;
                        if (propName == "width")
                          FBTest.ok(!FW.FBL.hasClass(props[i], "cssOverridden"), "The 'width' property of the first rule must not be overwritten.")
                    }

                    var props = rules[1].querySelectorAll(".cssProp");
                    for (var i=0; i<props.length; i++)
                    {
                        var propName = props[i].querySelector(".cssPropName").textContent;
                        if (propName == "width")
                          FBTest.ok(FW.FBL.hasClass(props[i], "cssOverridden"), "The 'width' property of the second rule must be overwritten.")
                    }
                }

                FBTest.testDone();
            });
        });
    });
}