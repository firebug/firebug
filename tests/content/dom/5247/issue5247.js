function runTest()
{
    FBTest.sysout("issue5247.START");

    FBTest.openNewTab(basePath + "dom/5247/issue5247.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("stylesheet");

        if (FBTest.selectPanelLocationByName(panel, "issue5247.html"))
        {
            FBTest.executeContextMenuCommand(FW.Firebug.chrome.$("fbLocationList"),
                "InspectIndomPanel", function()
            {
                // xxxHonza, xxxsz: hack that fixes this text on Mac. The panel can 
                // be selected asynchronously.
                setTimeout(function() {
                    onInspect();
                }, 1000);
            });
        }
        else
        {
            FBTest.testDone("issue5247.DONE");
        }
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
            if (props[i].textContent == "cssRules")
            {
                prop = props[i];
                break;
            }
        }

        var config = {tagName: "tr", classes: "memberRow ordinalRow", counter: 6};
        FBTest.waitForDisplayedElement("dom", config, function(row)
        {
            var cssRulesLabels = panel.panelNode.
                querySelectorAll(".memberRow.ordinalRow[level=\"1\"] .memberLabel");
            var cssRules = [];
            for (var i=0; i<cssRulesLabels.length; i++)
            {
                var cssRulesLabel = cssRulesLabels[i];
                cssRules.push(FW.FBL.getAncestorByClass(cssRulesLabel, "memberRow").
                    getElementsByClassName("memberValueCell").item(0));
            }

            if (FBTest.compare(6, cssRules.length, "There must be 6 CSS rules"))
            {
                var expectedCSSRules =
                [
                    "CSSCharsetRule utf-8",
                    "CSSImportRule external/externalStylesheet.css",
                    "CSSMediaRule (min-width: 500px) and (max-width: 700px)",
                    "CSSFontFaceRule \"TitilliumMaps\"",
                    "CSSKeyframesRule slidein",
                    "CSSStyleRule #internalRule"
                ];

                // xxxsz: We don't check the tooltips yet
                for (var i=0; i<cssRules.length; i++)
                {
                    FBTest.compare(expectedCSSRules[i], cssRules[i].textContent, (i+1)+
                        ". rule must be '"+expectedCSSRules[i]+"'");
                }
            }

            FBTest.testDone("issue5247.DONE");
        });

        FBTest.click(prop);
    }
}
