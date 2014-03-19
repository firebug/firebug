function runTest()
{
    FBTest.openNewTab(basePath + "css/6582/issue6582-1.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            var locationButtons = FW.Firebug.chrome.$("fbLocationButtons");
            FBTest.ok(locationButtons.getAttribute("collapsed") != "true",
                "Location button must be visible");

            FBTest.selectPanelLocationByName(panel, "issue6582-iframe.html");

            // Remove iframe with the stylesheet.
            FBTest.click(win.document.getElementById("removeIFrame"));

            var locations = panel.getLocationList();
            if (FBTest.compare(1, locations.length, "There must be one CSS file"))
            {
                var description = panel.getObjectDescription(locations[0]);
                FBTest.compare("testcase.css", description.name,
                    "The current CSS file name must be correct");
            }

            FBTest.testDone();
        });
    });
}
