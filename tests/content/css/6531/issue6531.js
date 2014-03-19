function runTest()
{
    FBTest.openNewTab(basePath + "css/6531/issue6531.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            var locationButtons = FW.Firebug.chrome.$("fbLocationButtons");
            FBTest.ok(locationButtons.getAttribute("collapsed") != "true", "Location button must be visible");

            var locations = panel.getLocationList();
            FBTest.compare(1, locations.length, "There must be just one CSS file in the Location Menu");

            if (locations.length == 1)
            {
                var description = panel.getObjectDescription(locations[0]);
                FBTest.ok("issue6531-iframe.html", description.name, "CSS file name must be correct");
            }

            FBTest.testDone();
        });
    });
}
