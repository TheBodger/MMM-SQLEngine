SELECT  
						    d_brand.value ||', '|| d_addr.value ||', '|| d_city.value                               AS subject,  
						    '£'||ROUND(CAST(d_price.value AS REAL) / 100, 3)||' : ' || '£'||ROUND(CAST(e_price.value AS REAL) / 100, 3) AS value,  
						    ROUND(  
						        SQRT(  
						            (CAST(a_station.easting  AS REAL) - CAST(a_centre.easting  AS REAL)) *  
						            (CAST(a_station.easting  AS REAL) - CAST(a_centre.easting  AS REAL))   
						            (CAST(a_station.northing AS REAL) - CAST(a_centre.northing AS REAL)) *  
						            (CAST(a_station.northing AS REAL) - CAST(a_centre.northing AS REAL))  
						        ) / 1000.0,  
						        2  
						    ) ||'Km'                                                               AS object  

						FROM  
						    data d_price, data e_price 
						    JOIN data d_pc      ON d_pc.object    = d_price.object AND d_pc.subject    = 'Station_Postcodes'  
						    JOIN data d_addr    ON d_addr.object  = d_price.object AND d_addr.subject  = 'Station_Address'  
						    JOIN data d_brand   ON d_brand.object = d_price.object AND d_brand.subject = 'Station_Brand'  

						    JOIN data d_city    ON d_city.object  = d_price.object AND d_city.subject  = 'Station_City'  
						    JOIN postcodes a_station ON a_station.postcode = d_pc.value  
						    JOIN postcodes a_centre  ON a_centre.postcode  = 'SL5 8EF'  
						WHERE  
						    d_price.subject = 'E10_Prices' and e_price.subject = 'Diesel_Prices'   
						    AND d_price.object = e_price.object   
						    AND CAST(d_price.value AS REAL) < 150  
						    AND (  
						        (CAST(a_station.easting  AS REAL) - CAST(a_centre.easting  AS REAL)) *  
						        (CAST(a_station.easting  AS REAL) - CAST(a_centre.easting  AS REAL))   
						        (CAST(a_station.northing AS REAL) - CAST(a_centre.northing AS REAL)) *  
						        (CAST(a_station.northing AS REAL) - CAST(a_centre.northing AS REAL))  
						    ) <= (15 * 1000.0) * (15 * 1000.0)  
						ORDER BY  
						    CAST(d_price.value AS REAL) ASC;