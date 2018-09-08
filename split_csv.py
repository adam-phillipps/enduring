import boto3
import math
import pandas as pd
import pdb
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
chunk_size = 1000  # size of result files by approx. row count

boto3.setup_default_session(profile_name=profile)
s3 = boto3.resource('s3', 'us-west-2')

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
    file = sys.argv[2] if '.csv' in sys.argv[2] else file
    s3.Object(bname, file).download_file(file)
elif len(sys.argv) == 2:
    file = sys.argv[1]

data = pd.read_csv(file, error_bad_lines=False)
chunks_count = math.ceil(len(data) / chunk_size)

# Math is rough and causes an explotion at the latter end of the alphabet
# because the symbols for the name aren't friendly any more
alphabet_ittr = 0
for i in range(chunks_count):
    letter = chr((i % 25) + 97)  # lowercase alphabetical ord <-> chr conversion
    alphabet_ittr = math.ceil((i + 1) / 25)
    fname = '.'.join([file, letter * alphabet_ittr, "csv"])
    print("Name: {} : {} -> {}".format(fname,
                                       (i * chunk_size),
                                       ((i+1) * chunk_size)))
    data[(i * chunk_size):((i + 1) * chunk_size)].to_csv(fname)
