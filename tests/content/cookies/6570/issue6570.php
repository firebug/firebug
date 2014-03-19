<?php
    date_default_timezone_set("UTC");

    header("Set-Cookie: issue6570_session=Hello Firebug user!", false);
    header("Set-Cookie: issue6570_maxage_future=Hello Firebug user!; Max-Age=123456", false);
    header("Set-Cookie: issue6570_maxage_delete=Hello Firebug user!; Max-Age=0", false);
    header("Set-Cookie: issue6570_expiry_future=Hello Firebug user!; Expires=" . date('D, d M Y H:i:s', strtotime('+1 years')) . " GMT", false);
    header("Set-Cookie: issue6570_expiry_delete=Hello Firebug user!; Expires=Thu, 01 Jan 1970 00:00:01 GMT", false);
    header("Set-Cookie: issue6570_delete=Hello Firebug user!; Expires=" . date('D, d M Y H:i:s', strtotime('+1 years')) . " GMT; Max-Age=0", false);
?>
<!DOCTYPE html>
<html>
    <head>
        <title>Issue 6570: Show when server deletes cookie in Net tab</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
    </head>
    <body>
        <header>
            <h1><a href="http://code.google.com/p/fbug/issues/detail?id=6570">Issue 6570</a>: Show when server deletes cookie in Net tab</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>Enable and switch to the <em>Net</em> panel</li>
                    <li>Reload the page</li>
                    <li>Expand the request to <em>issue6570.php</em><br/></li>
                    <li>Switch to the <em>Cookies</em> info tab</li>
                    <li>
                        <ul>
                                <li>There should be no values for <em>Max. Age</em>, <em>Expires</em> for cookie <em>issue6570_session</em></li>
                                <li><em>Max. Age</em> should be normal colour for cookie <em>issue6570_maxage_future</em></li>
                                <li><em>Max. Age</em> should be coloured <code>red</code> for cookie <em>issue6570_maxage_delete</em></li>
                                <li><em>Expires</em> should be normal colour for cookie <em>issue6570_expiry_future</em></li>
                                <li><em>Expires</em> should be coloured <code>red</code> for cookie <em>issue6570_expiry_delete</em></li>
                                <li><em>Expires</em> should be coloured <code>red</code> and <em>Max. Age</em> should be coloured <code>red</code> for cookie <em>issue6570_delete</em></li>
                        </ul>
                    </li>
                </ul>
            </section>
            <footer>Awad Mackie, firesock.serwalek@gmail.com</footer>
        </div>
    </body>
</html>
