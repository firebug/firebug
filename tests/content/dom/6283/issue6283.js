function runTest()
{
    FBTest.openNewTab(basePath + "dom/6283/issue6283.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            if (FBTest.selectPanelLocationByName(panel, "issue6283.html"))
            {
                FBTest.executeContextMenuCommand(FW.Firebug.chrome.$("fbLocationList"),
                    "InspectIndomPanel", function()
                {
                    // xxxHonza, xxxsz: hack that fixes this test on Mac. The panel can
                    // be selected asynchronously.
                    setTimeout(function() {
                        onInspect();
                    }, 1000);
                });
            }
            else
            {
                FBTest.testDone();
            }
        });
    });
}

function onInspect()
{
    var panel = FBTest.getSelectedPanel();
    if (FBTest.compare("dom", panel.name, "DOM panel must be selected now"))
    {
        var props = panel.panelNode.getElementsByClassName("memberLabel");
        var prop;

        for (var i=0; i<props.length; i++)
        {
            var propName = props[i].lastChild.textContent
            if (propName == "cssRules")
            {
                prop = props[i];
                break;
            }
        }

        if (!FBTest.ok(prop, "cssRules property must be there"))
        {
            FBTest.testDone();
            return;
        }

        var config = {tagName: "tr", classes: "memberRow ordinalRow"};
        FBTest.waitForDisplayedElement("dom", config, function(row)
        {
            var cssRulesLabel = panel.panelNode.
                querySelectorAll(".memberRow.ordinalRow[level=\"1\"] .memberLabel").item(0);
            var cssRuleValue = FW.FBL.getAncestorByClass(cssRulesLabel, "memberRow").
                getElementsByClassName("memberValueCell").item(0);

            FBTest.compare("CSSPageRule", cssRuleValue.textContent.trim(),
                "Rule must be displayed as CSSPageRule");

            FBTest.testDone();
        });

        FBTest.click(prop);
    }
}
