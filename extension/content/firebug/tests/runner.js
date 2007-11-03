

    // Figure out if we need to stagger the tests, or not
    var doDelay = typeof window != "undefined" && window.location && window.location.search == "?delay";

    // Get the output pre (if it exists, and if we're embedded in a runner page)
    var pre = typeof document != "undefined" && document.getElementsByTagName &&
        document.getElementsByTagName("pre")[0];

    // The number of iterations to do
    // and the number of seconds to wait for a timeout
    var numTests = 10, timeout = !doDelay ? 20000 : 4500;

    var title, testName, summary = 0, queue = [];

    // Initialize a batch of tests
    //  name = The name of the test collection
    this.startTest = function(name){
        testName = name;

        if ( typeof onlyName == "undefined" )
            startTable( testName );
    };

    // End the tests and finalize the report
    this.endTest = function(){
        // Save the summary output until all the test are complete
        queue.push(function(){
            if ( typeof onlyName == "undefined" ) {
                logSummary( summary );

            // Log the time to the special Talos function, if it exists
            } else if ( typeof tpRecordTime != "undefined" )
                tpRecordTime( summary );

            // Otherwise, we're only interested in the results from a single function
            else
                log([ "__start_report" + summary + "__end_report" ]);

            // Force an application quit (for the Mozilla perf test runner)
            if ( typeof goQuitApplication != "undefined" )
                goQuitApplication();
        });

        // Start running the first test
        dequeue();
    };

    // Run a new test
    //  name = The unique name of the test
    //  num = The 'length' of the test (length of string, # of tests, etc.)
    //  fn = A function holding the test to run
    this.test = function(name, num, fn){
        // Done't run the test if we're limiting to just one
        if ( typeof onlyName == "undefined" || (name == onlyName && num == onlyNum) ) {
            // Don't execute the test immediately
            queue.push(function(){
                doTest( name, num, fn );
            });
        }
    };

    // The actual testing function (only to be called via the queue control)
    function doTest(name, num, fn){
        title = name;
        var times = [], start, diff, sum = 0, min = -1, max = -1,
            median, std, mean;

        if ( !fn ) {
            fn = num;
            num = '';
        }

        // run tests
        try {
            // We need to let the test time out
            var testStart = (new Date()).getTime();

            for ( var i = 0; i < numTests; i++ ) {
                start = Date.now(); // (new Date()).getTime();
                fn();
                var cur = Date.now(); // (new Date()).getTime();
                diff = cur - start;
 //dump("diff:"+diff+" cur:"+cur+"-"+"start:"+start+"\n");
                // Make Sum
                sum += diff;

                // Make Min
                if ( min == -1 || diff < min )
                  min = diff;

                // Make Max
                if ( max == -1 || diff > max )
                  max = diff;

                // For making Median and Variance
                times.push( diff );

                // Check to see if the test has run for too long
                if ( timeout > 0 && cur - testStart > timeout )
                    break;
            }
        } catch( e ) {
            if ( typeof onlyName == "undefined" )
                return log( [ title, num, NaN, NaN, NaN, NaN, NaN ] );
            else
                return log( [ "__FAIL" + e + "__FAIL" ] );
        }

        // Throw out the max, its probably GC
        if (times.length > 3)
        {
            for (var i = 0; i < times.length; i++)
            {
                if (times[i] == max)
                    var imax = i;
            }

            if (imax)
                times.splice(imax, 1);

            max = 0;
            sum = 0;
            for (i = 0; i < times.length; i++)
            {
                if (times[i] > max)
                    max = times[i];
                sum += times[i];
            }
            mean = sum  / times.length;
        }

        // Make Mean
        mean = sum / times.length;
        mean = Math.round(mean * 10)/10;  // xxx.y

        // Keep a running summary going
        summary += mean;

        // Make Median
        times = times.sort(function(a,b){
            return a - b;
        });

        var halfWay =  Math.floor(times.length/2);  // 10->5, 9->4
        if ( times.length % 2 == 0 )
            median = (times[halfWay] + times[halfWay-1]) / 2;
        else
            median = times[halfWay];

        // Make Variance
        var variance = 0;
        for ( var i = 0; i < times.length; i++ )
            variance += Math.pow(times[i] - mean, 2);
        variance /= times.length - 1;

        // Make Standard Deviation
        std = Math.round(Math.sqrt( variance ));

        if ( typeof onlyName == "undefined" )
            log( {title: title, num: num, median: median, mean: mean, min: min, max: max, stddev: std, n: times.length, mscale: (median/num) } );

        // Execute the next test
        //dequeue();
    };

    // Remove the next test from the queue and execute it
    function dequeue(){
        // If we're in a browser, and the user wants to delay the tests,
        // then we should throw it in a setTimeout
        if ( doDelay && typeof setTimeout != "undefined" )
            setTimeout(function(){
                queue.shift()();
            }, 13);

        // Otherwise execute the test immediately
        else
            queue.shift()();
    }

    function startTable(header)
    {
        var cap = document.createElement("caption");
        document.getElementById("resultTable").parentNode.appendChild(cap);
        cap.innerHTML = header;

        cap = document.createElement("tr");
        document.getElementById("resultTable").appendChild(cap);
        cap.innerHTML="<th>Test</th><th>scaling</th><th>mean</th><th>stddev</th><th>min</th><th>median</th><th>max</th><th>N</th><th>median/scale</th>";
    }
    function logSummary(summary)
    {
        //dump("DONE summary: "+summary+"\n");
    }

    // Log the results
    function log( results ) {
        //dump(results+"\n");
        var aRow = document.createElement("tr");
        document.getElementById("resultTable").appendChild(aRow);
        var theRow =	row(results);
        aRow.innerHTML = theRow;
    }
    function row(results) {
        var aRow = [
            cell(results, "title"),
            cell(results, "num"),
            cell(results, "mean"),
            cell(results, "stddev"),
            cell(results, "min"),
            cell(results, "median"),
            cell(results, "max"),
            cell(results, "n"),
            cell(results, "mscale")
            ];
        return aRow.join("");
    }
    function cell(results, id) {
        var aCell = "<td class=\'"+id+"\'>"+results[id]+"</td>";
        return aCell;
    }

