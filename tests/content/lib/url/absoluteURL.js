function runTest()
{
    // http://www.apps.ietf.org/rfc/rfc3986.html#sec-5
    var testBaseURL = "http://a/b/c/d;p?q";

    var absoluteURL = FW.FBL.absoluteURL("g", testBaseURL);
    var rfc3986_5_4 = [
        {relative: "g:h",  absolute: "g:h"},
        {relative: "g",  absolute: "http://a/b/c/g"},
        {relative: "./g",  absolute: "http://a/b/c/g"},
        {relative: "1/g",  absolute: "http://a/b/c/1/g"},
        {relative: "g/",  absolute: "http://a/b/c/g/"},
        {relative: "/g",  absolute: "http://a/g"},
        {relative: "//g",  absolute: "http://g"},
        {relative: "?y", absolute: "http://a/b/c/d;p?y"},
        {relative: "g?y",  absolute: "http://a/b/c/g?y"},
        {relative: "#s",  absolute: "http://a/b/c/d;p?q#s"},
        {relative: "g#s",   absolute: "http://a/b/c/g#s"},
        {relative: "g?y#s",   absolute: "http://a/b/c/g?y#s"},
        {relative: ";x",   absolute: "http://a/b/c/;x"},
        {relative: "g;x",  absolute: "http://a/b/c/g;x"},
        {relative: "g;x?y#s",  absolute: "http://a/b/c/g;x?y#s"},
        {relative: "",  absolute: "http://a/b/c/d;p?q"},
        // more with dots and also abnormal example needed
    ];


    for (var i = 0; i < rfc3986_5_4.length; i++)
    {
        var relative = rfc3986_5_4[i].relative;
        var absolute = rfc3986_5_4[i].absolute;
        FBTest.compare(absolute, FW.FBL.absoluteURL(relative, testBaseURL), "For base "+testBaseURL+" relative url: "+relative+" = "+absolute);
    }

    FBTest.testDone();
}
