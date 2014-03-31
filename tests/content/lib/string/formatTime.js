function runTest()
{
    var testValues = [
        {expected: "0ms", value: 0},
        {expected: "123ms", value: 123},
        {expected: (1.23).toLocaleString() + "s", value: 1234},
        {expected: "2m 3s", value: 123456},
        {expected: "3h 25m 46s", value: 12345678},
        {expected: "1d 10h 17m 37s",  value: 123456789},
        {expected: "142d 21h 21m 19s",  value: 12345678901},
        {expected: "1h", value: 3600000},
        {expected: "1h 1s", value: 3601000},
        {expected: "-123ms",  value: -123},
        {expected: (-1.23).toLocaleString() + "s",  value: -1234},
        {expected: "-2m 3s", value: -123456},
        {expected: "-3h 25m 46s", value: -12345678},
        {expected: "-1d 10h 17m 37s",  value: -123456789},
        {expected: "-1h", value: -3600000},
        {expected: "-1h 1s", value: -3601000},
        {expected: "-142d 21h 21m 19s",  value: -12345678901},
        {expected: "0s", value: 0, minUnit: "s"},
        {expected: (0.12).toLocaleString() + "s", value: 123, minUnit: "s"},
        {expected: "123s", value: 123456, maxUnit: "s"},
        {expected: (2.06).toLocaleString() + "m", value: 123456, minUnit: "m", maxUnit: "m"},
        {expected: "34h " + (17.61).toLocaleString() + "m", value: 123456789, minUnit: "m",
            maxUnit: "h"},
        {expected: "20m " + (34.6).toLocaleString() + "s", value: 1234567, decimalPlaces: 1},
        {expected: "20m " + (34.57).toLocaleString() + "s", value: 1234567, decimalPlaces: 2},
        {expected: "20m " + (34.567).toLocaleString() + "s", value: 1234567, decimalPlaces: 3},
        {expected: (1.2).toLocaleString() + "s", value: 1234, minUnit: "s", decimalPlaces: 1},
        {expected: (1234.6).toLocaleString() + "s", value: 1234567, maxUnit: "s",
            decimalPlaces: 1},
        {expected: (205.8).toLocaleString() + "m", value: 12345678, minUnit: "m", maxUnit: "m",
            decimalPlaces: 1}
    ];


    for (var i=0, len=testValues.length; i<len; ++i)
    {
        var value = testValues[i];
        var msg = "Formatted time for " + value.value;
        if (value.minUnit || value.maxUnit || value.decimalPlaces)
        {
            var params = "";
            if (value.minUnit)
                params += "min. unit: \"" + value.minUnit + "\"";
            if (value.maxUnit)
            {
                if (params != "")
                    params += ", ";
                params += "max. unit: \"" + value.maxUnit + "\" ";
            }
            if (value.decimalPlaces)
            {
                if (params != "")
                    params += ", ";
                params += "decimal places: " + value.decimalPlaces;
            }

            msg += " (" + params + ")";
        }
        msg += " must match expected format";

        FBTest.compare(value.expected, FW.FBL.formatTime(value.value, value.minUnit, value.maxUnit,
                value.decimalPlaces), msg);
    }

    FBTest.testDone();
}
