#! /usr/bin/env python
import numpy as np
import pandas as pd
import sys
import json
import csv
import argparse
from dateutil.parser import parse
province_state_key = "Province/State"
country_region_key = "Country/Region"

class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        else:
            return super(NpEncoder, self).default(obj)

def x(row):
    time_series_data = row.drop(columns = ['Combined_Key', 'pop', 'l_1', 'l_2', 'l_3', 'lat', 'lng', 'name'], errors = 'ignore')
    epoch_mins = time_series_data.index.map(lambda x: parse(x).timestamp() / 60)
    data = zip(epoch_mins.values, time_series_data.values)
    time_series_list = []
    for t in data:
        time_series_list.append({'time': t[0], 'cases': t[1]})
    #print(time_series_data)
    return time_series_list

def x2(row):
    time_series_data = row.drop(['Combined_Key', 'pop', 'l_1', 'l_2', 'l_3', 'lat', 'lng', 'name'], errors = 'ignore')
    time_series_data = time_series_data.fillna(0)
    epoch_mins = time_series_data.index.map(lambda x: parse(x).timestamp() / 60)
    data = zip(epoch_mins.values, time_series_data.values)
    time_series_list = []
    for t in data:
        time_series_list.append({'time': t[0], 'cases': t[1]})
    #print(time_series_data)
    return time_series_list

def get_pop(row):
    key = row.replace(", ", ",")
    if key in pop_dict:
        return pop_dict[key]
    else:
        return 0

def getname(row):
    key = ''
    if row['l_2'] == "":
      key = row['l_1']
    else:
      key = row['l_2'].replace(", ", ",") + "," + row['l_1'].replace(", ", ",")
    return key

#
def process_us(us_csv_file):
    df = pd.read_csv(us_csv_file).drop(columns=['FIPS', 'UID', 'iso2', 'iso3', 'code3', 'Country_Region', 'Population'], errors='ignore')
    df = df.rename(columns = {"Lat": "lat", "Long_": "lng", "Admin2": 'l_3', "Province_State": 'l_2'})
    df['name'] = df['Combined_Key'].apply(lambda row: row[:-4])
    df['l_1'] = 'United States'
    df['pop'] = df['Combined_Key'].apply(get_pop)
    df['pop'] = df['pop'].fillna(0)
    df = df[df['pop'] != 0]
    df = df.dropna(subset=['lat', 'lng', 'pop'])
    df = df[(df['lng'] != 0) & (df['lat'] != 0)]
    row_list = []
    county_df = df.copy()
    county_df['time_series'] = county_df.apply(x2, axis = 1)
    county_df = county_df.drop(columns = 'Combined_Key')
    county_df = county_df.dropna(subset=['time_series'])
    county_df['l'] = 1
    row_list.extend(county_df.to_dict('records'))
    
    grouped = df.groupby(by=["l_2"], dropna = False)
    for name, group in grouped:
        key = f'{name},US'
        pop = pop_dict[key]
        lat = lat_lng_dict[key][0]
        lng = lat_lng_dict[key][1]
        time_series_data = group.drop(columns = ['Combined_Key', 'pop', 'l_1', 'l_2', 'l_3', 'lat', 'lng', 'name'], errors='ignore').agg('sum', axis = 0)
        epoch_mins = time_series_data.index.map(lambda x: parse(x).timestamp() / 60)
        data = zip(epoch_mins.values, time_series_data.values)
        time_series_list = []
        for t in data:
            time_series_list.append({'time': int(t[0]), 'cases': int(t[1])})
        if len(time_series_list) > 0:
            row_list.append({'name': name, 'lat': lat, 'lng': lng, 'pop': pop, 'l':2, 'l_1': 'United States', 'l_2': name, 'l_3': '', 'time_series' :time_series_list})


    return row_list

# minor changes since the vaccine data is only by state, not by county
def process_vaccine_us(us_csv_file):
    df = pd.read_csv(us_csv_file).drop(columns=['FIPS', 'UID', 'iso2', 'iso3', 'code3', 'Country_Region', 'Population', 'Admin2'], errors='ignore')
    df = df.rename(columns = {"Lat": "lat", "Long_": "lng", "Province_State": 'l_2'})
    
    """
    Dropping these rows as they are not needed
        Department of Defense
        Federal Bureau of Prisons 
        Indian Health Services 
        Long Term Care (LTC) Program 
        Veterans Health Administration
    """
    df = df[df['lat'].notna()] #remove rows without a lat value
    df = df.fillna(0)
    df['name'] = df['Combined_Key'].apply(lambda row: row[:-4])
    df['l_1'] = 'United States'
    df['pop'] = df['Combined_Key'].apply(get_pop)
    df['pop'] = df['pop'].fillna(0)
    df = df[df['pop'] != 0]
    df = df.dropna(subset=['lat', 'lng', 'pop'])
    df = df[(df['lng'] != 0) & (df['lat'] != 0)]
    row_list = []
    # print("process us, df[name]")
    # print(df['name'])

    grouped = df.groupby(by=["l_2"], dropna = False)
    for name, group in grouped:
        key = f"{name},US"
        pop = pop_dict[key]
        lat = lat_lng_dict[key][0]
        lng = lat_lng_dict[key][1]
        time_series_data = group.drop(columns = ['Combined_Key', 'pop', 'l_1', 'l_2', 'l_3', 'lat', 'lng', 'name'], errors='ignore').agg('sum', axis = 0)
        epoch_mins = time_series_data.index.map(lambda x: parse(x).timestamp() / 60)
        data = zip(epoch_mins.values, time_series_data.values)
        time_series_list = []
        # print("process us, group")
        # print(key)
        for t in data:
            time_series_list.append({'time': int(t[0]), 'cases': int(t[1])})
        if len(time_series_list) > 0:
            row_list.append({'name': name, 'lat': lat, 'lng': lng, 'pop': pop, 'l':2, 'l_1': 'United States', 'l_2': name, 'l_3': '', 'time_series' :time_series_list})

    return row_list   

def process_global(world_csv_file):
    df = pd.read_csv(world_csv_file).rename(columns = {"Lat": "lat", "Long": "lng", "Country/Region": 'l_1', "Province/State": 'l_2'})
    df['l_2'] = df['l_2'].fillna('')
    df['l_3'] = ''
    df['Combined_Key'] = df.apply(getname, axis = 1)
    df['name'] = df['Combined_Key']
    #df = df[50:100]
    df['time_series'] = df.apply(x2, axis = 1)
    df['pop'] = df['Combined_Key'].apply(get_pop)
    df = df[df['pop'] != 0]
    df = df.drop(columns = 'Combined_Key')
    df['l'] = df['l_2'].apply(lambda x: 2 if len(x) != 0 else 1)
    df.loc[(df['name'] == 'US'), 'l_1'] = 'The United States'
    df.loc[(df['name'] == 'US'), 'l_2'] = ''
    df.loc[(df['name'] == 'US'), 'l'] = 3
    df.loc[(df['name'] == 'US'), 'name'] = 'The United States'
    df = df[df['name'] != 'US']
    df = df.dropna(subset=['lat', 'lng', 'pop', 'time_series'])
    df = df[(df['lng'] != 0) & (df['lat'] != 0)]
    df = df[['name', 'lat', 'lng', 'pop', 'l', 'l_1', 'l_2', 'l_3', 'time_series']]
    return df.to_dict('records')
    
# minor changes since the vaccine data has different 
def process_vaccine_global(world_csv_file):
    df = pd.read_csv(world_csv_file).drop(columns=['FIPS', 'UID', 'iso2', 'iso3', 'code3', 'Population', 'Admin2', 'Combined_Key'], errors='ignore')
    df = df.rename(columns = {"Lat": "lat", "Long_": "lng", "Country_Region": 'l_1', "Province_State": 'l_2'})
    df['l_2'] = df['l_2'].fillna('')
    df['l_3'] = ''
    df['Combined_Key'] = df.apply(getname, axis = 1)
    df['name'] = df['Combined_Key']
    #df = df[50:100]
    df['time_series'] = df.apply(x2, axis = 1)
    df['pop'] = df['Combined_Key'].apply(get_pop)
    df = df[df['pop'] != 0]
    df = df.drop(columns = 'Combined_Key')
    df['l'] = df['l_2'].apply(lambda x: 2 if len(x) != 0 else 1)
    df.loc[(df['name'] == 'US'), 'l_1'] = 'The United States'
    df.loc[(df['name'] == 'US'), 'l_2'] = ''
    df.loc[(df['name'] == 'US'), 'l'] = 3
    df.loc[(df['name'] == 'US'), 'name'] = 'The United States'
    df = df[df['name'] != 'US']
    df = df.dropna(subset=['lat', 'lng', 'pop', 'time_series'])
    df = df[(df['lng'] != 0) & (df['lat'] != 0)]
    df = df[['name', 'lat', 'lng', 'pop', 'l', 'l_1', 'l_2', 'l_3', 'time_series']]
    return df.to_dict('records')

def read_time_series(name):
    jhu_data_dir = "COVID-19/csse_covid_19_data/csse_covid_19_time_series"
    world_csv_file = f'{jhu_data_dir}/time_series_covid19_{name}_global.csv'
    us_csv_file = f'{jhu_data_dir}/time_series_covid19_{name}_US.csv'

    row_list = []
    if name != 'recovered':
        row_list.extend(process_us(us_csv_file))
    row_list.extend(process_global(world_csv_file))


    return row_list
    
# vaccine based off of above
def read_vaccine_time_series():
    jhu_data_dir = "COVID-20/vaccine_data/"
    world_csv_file = f'{jhu_data_dir}/global_data/time_series_covid19_vaccine_global.csv'
    
    #only have state level data
    us_csv_file = f'{jhu_data_dir}/us_data/time_series/vaccine_data_us_timeline.csv'

    row_list = []
    if name != 'recovered':
        row_list.extend(process_us(us_csv_file))
    row_list.extend(process_global(world_csv_file))


    return row_list
    
# vaccine based off of above, they are in a different folder
def read_vaccine_time_series():
    jhu_data_dir = "COVID-20/vaccine_data/"
    world_csv_file = f'{jhu_data_dir}/global_data/time_series_covid19_vaccine_doses_admin_global.csv'    
    #only have state level data
    us_csv_file = f'{jhu_data_dir}/us_data/time_series/time_series_covid19_vaccine_doses_admin_US.csv'

    row_list = []
    row_list.extend(process_vaccine_us(us_csv_file))
    row_list.extend(process_vaccine_global(world_csv_file))
    return row_list    
    
def read_pop():
    file = "COVID-19/csse_covid_19_data/UID_ISO_FIPS_LookUp_Table.csv"
    dict = {}
    lat_lng_dict = {}
    with open(file, 'r') as csv_file:
      reader = csv.DictReader(csv_file)
      for row in reader:
          key = row["Combined_Key"].replace(", ", ",")
          dict[key] = row["Population"]
          lat_lng_dict[key] = (row["Lat"], row["Long_"])
    return dict, lat_lng_dict
    
# running code    
pop_dict, lat_lng_dict = read_pop()
pop_dict["District of Columbia,District of Columbia,US"] = pop_dict["District of Columbia,US"]
data_series = ["confirmed", "recovered", "deaths"] # not used

#Reading in the csv data
confirmed = read_time_series("confirmed")
recovered = read_time_series("recovered")
deaths = read_time_series("deaths")
vaccines = read_vaccine_time_series()
# print("about to exit")
# exit()

row_list = []
for i in range(0, len(confirmed)):
    confirmed_entry = confirmed[i]
    deaths_entry = next((e for e in deaths if e['name'] == confirmed_entry['name']))
    vaccines_entry = next((e for e in vaccines if e['name'] == confirmed_entry['name']), None)
    recovered_entry = next((e for e in recovered if e['name'] == confirmed_entry['name']), None)

    time_series = []
    if recovered_entry and vaccines_entry:
        for (c,d,r,v) in zip(confirmed_entry['time_series'], deaths_entry['time_series'], recovered_entry['time_series'], vaccines_entry['time_series']):
            time_series_entry = [c['time'], c['cases'], d['cases'], r['cases'],v['cases']]
            time_series.append(time_series_entry)
    elif recovered_entry and not vaccines_entry:
        for (c,d,r) in zip(confirmed_entry['time_series'], deaths_entry['time_series'], recovered_entry['time_series']):
            time_series_entry = [c['time'], c['cases'], d['cases'], r['cases'],0]
            time_series.append(time_series_entry)
    elif not recovered_entry and vaccines_entry:
        for (c,d,v) in zip(confirmed_entry['time_series'], deaths_entry['time_series'], vaccines_entry['time_series']):
            time_series_entry = [c['time'], c['cases'], d['cases'], 0,v['cases']]
            time_series.append(time_series_entry)
    else:
        for (c,d) in zip(confirmed_entry['time_series'], deaths_entry['time_series']):
            time_series_entry = [c['time'], c['cases'], d['cases'], 0, 0]
            time_series.append(time_series_entry)

    if i % 1000 == 0:
        print(f'{i} / {len(confirmed)}')
    row_list.append({
        'name': confirmed_entry['name'],
        'lat': confirmed_entry['lat'],
        'lng': confirmed_entry['lng'],
        'time_series': time_series,
        'pop': confirmed_entry['pop'],
        'l_1' : confirmed_entry['l_1'],
        'l_2' : confirmed_entry['l_2'],
        'l_3' : confirmed_entry['l_3'],
        'l' : confirmed_entry['l']
    })

with open('webpage/jhu_data_vacc.js', 'w') as json_file:
  print("writing to file")
  json_file.write('jhuData = ')
  json.dump(row_list, json_file, cls=NpEncoder)
  print("DONE!")
