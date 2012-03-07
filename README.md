Firebug
=======
** Web Development Evolved.**

[getfirebug.com](getfirebug.com)


Repository Structure
--------------------
See [more](http://getfirebug.com/wiki/index.php/Source) information about Firebug
repository structure.


* **extension** Firebug extension directory.
* **tests** Firebug automated test files and test harness.
* **trace** Firebug tracing console.


Build Firebug XPI
-----------------
In order to build Firebug *.xpi package run following in your command line

    $ cd firebug/extension
    $ ant

The *.xpi file should be located within *release* directory.


Run Firebug From Source
-----------------------
The *extension* directory represents Firebug extension directory and so, you run Firebug
directly from it.

# Locate your Firefox [profile folder](http://kb.mozillazine.org/Profile_folder)
# Open extensions/ folder, create it if it doesn't exist.
# Create a new text file and put the full path to your development folder inside.
(e.g. C:\firebug\extension\ or ~/firebug/extension/). Windows users should retain the OS'
slash direction, and everyone should remember to include a closing slash and remove any
trailing spaces.
# Save the file with Firebug ID firebug@software.joehewitt.com


Resources
---------

* Home: 