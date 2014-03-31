function runTest()
{
    var testURLWithParameters = "https://ssl.google-analytics.com/__utm.gif?" +
        "utmwv=4.5.6&utmn=954720376&utmhn=store.httpwatch.com&utmcs=UTF-8&" +
        "utmsr=1280x768&utmsc=32-bit&utmul=en-us&utmje=1&utmfl=10.0%20r32&" +
        "utmdt=Online%20Store&utmhid=1130163334&utmr=-&utmp=%2Forderempty.aspx&" +
        "utmac=UA-533344-1&utmcc=__utma%3D27892197.112033262.1252943363.1253107865.1253108262.8" +
        "%3B%2B__utmz%3D27892197.1252943363.1.1.utmcsr%3D(direct)%7Cutmccn%3D(direct)" +
        "%7Cutmcmd%3D(none)%3B";

    var expectedParams = [
        {name: "utmac",  value: "UA-533344-1"},
        {name: "utmcc",  value: "__utma=27892197.112033262.1252943363.1253107865.1253108262.8;+__utmz=27892197.1252943363.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none);"},
        {name: "utmcs",  value: "UTF-8"},
        {name: "utmdt",  value: "Online Store"},
        {name: "utmfl",  value: "10.0 r32"},
        {name: "utmhid", value: "1130163334"},
        {name: "utmhn",  value: "store.httpwatch.com"},
        {name: "utmje",  value: "1"},
        {name: "utmn",   value: "954720376"},
        {name: "utmp",   value: "/orderempty.aspx"},
        {name: "utmr",   value: "-"},
        {name: "utmsc",  value: "32-bit"},
        {name: "utmsr",  value: "1280x768"},
        {name: "utmul",  value: "en-us"},
        {name: "utmwv",  value: "4.5.6"}
    ];

    // Firebug sorts created parameters by default.
    expectedParams.sort(function(a, b) { return a.name <= b.name ? -1 : 1; });

    // Call suspected function.
    var params = FW.FBL.parseURLParams(testURLWithParameters);

    // Verification.
    if (FBTest.compare(expectedParams.length, params.length,
        "There must be " + expectedParams.length + " parameters."))
    {
        for (var i = 0; i < params.length; i++)
        {
            var name = expectedParams[i].name;
            var value = expectedParams[i].value;
            FBTest.compare(name, params[i].name, "Param name must be the equal to: " + name);
            FBTest.compare(value, params[i].value, name + " value must be the equal to: " + value);
        }
    }

    FBTest.testDone();
}
