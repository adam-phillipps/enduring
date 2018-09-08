import boto3
import math
import pandas as pd
import sys
from sklearn.model_selection import train_test_split


################################################################################
# CONFIGURATION
################################################################################
# create a couple defaults for the file name and AWS profile,
# which will help if you're running this locally
# (not with an AWS IAM role/profile)
file = 'Endurance.csv'
profile = 'smash' if not len(sys.argv) > 3 else sys.argv[3]

boto3.setup_default_session(profile_name=profile)
s3 = boto3.resource('s3', 'us-west-2')
sqs = boto3.client('sqs', 'us-west-2')

################################################################################
# USAGE (Runtime configuration) and DESCRIPTION
################################################################################
# python split_csv.py [[<bucket name>, ]<file name>[, <AWS profile name>]]
#
# exp
#
#   python split_csv.py
#   > this will attempt to use a local file called `Endurance.csv` and it will
#     try to run with an AWS profile called `smash`
#
#   python split_csv.py artifacts-bucket Endurance.csv
#   > thsi will get the `Endurnace.csv` file from the `artifacts-bucket` using
#     the `smash` profile
#
#   python split_csv.py artifacts-bucket gibangous.csv fredward
#   > thsi will get the `gibangous.csv` file from the `artifacts-bucket` using
#     the `fredward` profile
if len(sys.argv) >= 3:
    bname = sys.argv[1]
    fname = sys.argv[2]
    file = s3.Object(bname, fname).download_file(fname)
elif len(sys.argv) == 2:
    file = sys.argv[1]


chunks = 10
file = None

data = pd.read_csv(sys.argv[2], error_bad_lines=False)
set_size = math.ceil(len(data) / chunks)

# Math is rough and causes an explotion at the later end of the alphabet because
# the symbols for the name aren't friendly any more
for n in range(chunks):
    letter = (n % 25) + 97  # lowercase alphabetical ord <-> chr conversion
    num_to_char = chr(letter)
    f_name = "Endurance.{}.csv".format(num_to_char * n)
    data[(n * set_size):((n+1) * set_size)].to_csv(f_name)
